"""
שלטי הצפון - Backend API
FastAPI + SQLite + JWT Authentication
"""

from fastapi import FastAPI, HTTPException, Depends, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List
import sqlite3
import hashlib
import jwt
import os
import io
from datetime import datetime, timedelta
from contextlib import contextmanager
from PIL import Image
import pymupdf  # for rasterizing PDF artwork to a preview image

# ─── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "shlate-tzafon-secret-key-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24
# DB_PATH should point at a persistent disk in production (e.g. Render Persistent
# Disk mounted at /data) — the container filesystem itself is wiped on every deploy,
# so without a persistent mount the database resets to empty each time.
DB_PATH = os.getenv("DB_PATH", "pricing_v4.db")

app = FastAPI(title="שלטי הצפון API", version="4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

# ─── Database ──────────────────────────────────────────────────────────────────
_db_dir = os.path.dirname(DB_PATH)
if _db_dir:
    os.makedirs(_db_dir, exist_ok=True)


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def init_db():
    with get_db() as conn:
        cur = conn.cursor()

        # Admin table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # Users table
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE,
                password_hash TEXT,
                first_name TEXT,
                last_name TEXT,
                phone TEXT,
                company_name TEXT,
                invoice_name TEXT,
                tax_id TEXT,
                address TEXT,
                role TEXT DEFAULT 'user',
                discount_percent INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Categories table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL
            )
        """)

        # Materials table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS materials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                price_per_sqm REAL NOT NULL,
                min_sqm REAL DEFAULT 0.1,
                max_width REAL DEFAULT 0,
                max_length REAL DEFAULT 0,
                min_price REAL DEFAULT 0,
                min_linear_m REAL DEFAULT 0,
                active INTEGER DEFAULT 1,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            )
        """)

        # Products (Shelf Products) table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                base_material_id INTEGER,
                print_material_id INTEGER,
                lamination_id INTEGER,
                active INTEGER DEFAULT 1,
                FOREIGN KEY (base_material_id) REFERENCES materials(id),
                FOREIGN KEY (print_material_id) REFERENCES materials(id),
                FOREIGN KEY (lamination_id) REFERENCES materials(id)
            )
        """)

        # Quotes table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS quotes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                width_cm REAL NOT NULL,
                height_cm REAL NOT NULL,
                sqm REAL NOT NULL,
                print_material_id INTEGER,
                base_material_id INTEGER,
                lamination_id INTEGER,
                quantity INTEGER DEFAULT 1,
                total_price REAL NOT NULL,
                breakdown TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        # Uploaded artwork (image/PDF). Stored as a blob in the DB itself rather than on the
        # container's filesystem, since there's no persistent disk mounted yet — this way the
        # same future disk-mount fix that protects the DB automatically protects files too.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS order_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT,
                content_type TEXT,
                data BLOB NOT NULL,
                width_px INTEGER,
                height_px INTEGER,
                original_content_type TEXT,
                original_data BLOB,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # A multi-item order/cart: one or more order_items, each independently sized and
        # materialed, nested together per-material across the whole order for pricing.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                total_price REAL NOT NULL,
                breakdown TEXT,
                status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        # `status` lets a future "nest everything approved for production" batch job pool
        # order_items across many separate orders by querying status='approved' directly,
        # without a schema change.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                width_cm REAL NOT NULL,
                height_cm REAL NOT NULL,
                quantity INTEGER DEFAULT 1,
                print_material_id INTEGER,
                base_material_id INTEGER,
                lamination_id INTEGER,
                file_id INTEGER,
                offset_cm REAL DEFAULT 0,
                price REAL,
                status TEXT DEFAULT 'pending',
                FOREIGN KEY (order_id) REFERENCES orders(id),
                FOREIGN KEY (file_id) REFERENCES order_files(id)
            )
        """)

        # Migrations (safe ALTER for existing DBs)
        migrations = [
            "ALTER TABLE users ADD COLUMN invoice_name TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN tax_id TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN discount_percent INTEGER DEFAULT 0",
            "ALTER TABLE materials ADD COLUMN max_width REAL DEFAULT 0",
            "ALTER TABLE materials ADD COLUMN max_length REAL DEFAULT 0",
            "ALTER TABLE materials ADD COLUMN min_price REAL DEFAULT 0",
            "ALTER TABLE materials ADD COLUMN min_linear_m REAL DEFAULT 0",
        ]
        for m in migrations:
            try:
                cur.execute(m)
            except sqlite3.OperationalError:
                pass

        # Seed admin
        cur.execute("SELECT COUNT(*) FROM admins")
        if cur.fetchone()[0] == 0:
            cur.execute(
                "INSERT INTO admins (username, password_hash) VALUES (?, ?)",
                ("admin", hash_password("admin123"))
            )

        # Seed categories
        for cat in [("PRINT", "הדפסה"), ("BASE", "בסיס"), ("LAMINATION", "למינציה")]:
            cur.execute(
                "INSERT OR IGNORE INTO categories (name, display_name) VALUES (?, ?)",
                cat
            )

        # Seed default materials
        cur.execute("SELECT id FROM categories WHERE name='PRINT'")
        print_id = cur.fetchone()["id"]
        cur.execute("SELECT id FROM categories WHERE name='BASE'")
        base_id = cur.fetchone()["id"]
        cur.execute("SELECT id FROM categories WHERE name='LAMINATION'")
        lam_id = cur.fetchone()["id"]

        cur.execute("SELECT COUNT(*) FROM materials")
        if cur.fetchone()[0] == 0:
            default_materials = [
                (print_id, "ויניל גלוס", 35.0),
                (print_id, "ויניל מאט", 38.0),
                (print_id, "בד מתוח", 45.0),
                (print_id, "פוליאסטר", 55.0),
                (base_id, "לוח פי.וי.סי 3מ\"מ", 40.0),
                (base_id, "לוח אלומיניום 2מ\"מ", 85.0),
                (base_id, "לוח קרטון", 15.0),
                (base_id, "לוח פורקס", 65.0),
                (lam_id, "למינציה גלוס", 12.0),
                (lam_id, "למינציה מאט", 14.0),
                (lam_id, "ללא למינציה", 0.0),
            ]
            cur.executemany(
                "INSERT INTO materials (category_id, name, price_per_sqm) VALUES (?, ?, ?)",
                default_materials
            )


# ─── JWT Utils ─────────────────────────────────────────────────────────────────
def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token פג תוקף")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token לא תקין")


def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="גישה מורשית למנהלים בלבד")
    return payload


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    return payload


# ─── Schemas ───────────────────────────────────────────────────────────────────
class AdminLogin(BaseModel):
    username: str
    password: str

class PhoneLogin(BaseModel):
    phone: str

class PhoneRegister(BaseModel):
    phone: str
    first_name: str
    last_name: str
    invoice_name: Optional[str] = ""
    tax_id: Optional[str] = ""
    email: Optional[str] = ""
    company_name: Optional[str] = ""

class UserRegister(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = ""
    company_name: Optional[str] = ""
    address: Optional[str] = ""
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class MaterialCreate(BaseModel):
    category_id: int
    name: str
    price_per_sqm: float
    min_sqm: Optional[float] = 0.1
    max_width: Optional[float] = 0.0
    max_length: Optional[float] = 0.0
    min_price: Optional[float] = 0.0
    min_linear_m: Optional[float] = 0.0

class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    price_per_sqm: Optional[float] = None
    min_sqm: Optional[float] = None
    max_width: Optional[float] = None
    max_length: Optional[float] = None
    min_price: Optional[float] = None
    min_linear_m: Optional[float] = None
    category_id: Optional[int] = None
    active: Optional[int] = None

class QuoteRequest(BaseModel):
    width_cm: float
    height_cm: float
    quantity: int = 1
    print_material_id: Optional[int] = None
    base_material_id: Optional[int] = None
    lamination_id: Optional[int] = None

class AdminQuoteRequest(BaseModel):
    width_cm: float
    height_cm: float
    quantity: int = 1
    print_material_id: Optional[int] = None
    base_material_id: Optional[int] = None
    lamination_id: Optional[int] = None
    user_id: Optional[int] = None
    discount_override: Optional[float] = None  # manual override, None = use user's discount
    save_quote: Optional[bool] = True

class QuoteUpdate(BaseModel):
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    quantity: Optional[int] = None
    print_material_id: Optional[int] = None
    base_material_id: Optional[int] = None
    lamination_id: Optional[int] = None
    discount_override: Optional[float] = None

class OrderItemIn(BaseModel):
    width_cm: float
    height_cm: float
    quantity: int = 1
    print_material_id: Optional[int] = None
    base_material_id: Optional[int] = None
    lamination_id: Optional[int] = None
    file_id: Optional[int] = None
    offset_cm: Optional[float] = 0  # extra margin/frame added around the object, per side

class OrderCalculateRequest(BaseModel):
    items: List[OrderItemIn]
    user_id: Optional[int] = None
    discount_override: Optional[float] = None
    save_order: Optional[bool] = True

class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    invoice_name: Optional[str] = None
    tax_id: Optional[str] = None
    address: Optional[str] = None
    discount_percent: Optional[int] = None

class AdminUserCreate(BaseModel):
    first_name: str
    last_name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    company_name: Optional[str] = ""
    invoice_name: Optional[str] = ""
    tax_id: Optional[str] = ""
    address: Optional[str] = ""
    discount_percent: Optional[int] = 0

class ProductCreate(BaseModel):
    name: str
    base_material_id: Optional[int] = None
    print_material_id: Optional[int] = None
    lamination_id: Optional[int] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    base_material_id: Optional[int] = None
    print_material_id: Optional[int] = None
    lamination_id: Optional[int] = None
    active: Optional[int] = None


# ─── Shared Quote Calculation Logic ────────────────────────────────────────────
def _fit_layout(item_w, item_h, qty, roll_w):
    """Best-fit packing of `qty` items (item_w x item_h cm) across a roll of width roll_w (cm).
    Returns dict with cols, rows, is_rotated, required_length_cm — or None if the item doesn't
    fit the roll width in either orientation."""
    if roll_w <= 0 or item_w <= 0 or item_h <= 0 or qty <= 0:
        return None

    cols_upright = int(roll_w // item_w)
    len_upright = float('inf')
    if cols_upright > 0:
        rows_upright = (qty + cols_upright - 1) // cols_upright
        len_upright = rows_upright * item_h

    cols_rot = int(roll_w // item_h)
    len_rot = float('inf')
    if cols_rot > 0:
        rows_rot = (qty + cols_rot - 1) // cols_rot
        len_rot = rows_rot * item_w

    best_len = min(len_upright, len_rot)
    if best_len == float('inf'):
        return None

    is_rotated = len_rot < len_upright
    cols = cols_rot if is_rotated else cols_upright
    rows_n = (qty + cols - 1) // cols
    return {"cols": cols, "rows": rows_n, "is_rotated": is_rotated, "required_length_cm": best_len}


def fit_layout_multi(pieces, roll_w):
    """Simple shelf (row) bin-packing of many differently-sized pieces onto a roll/sheet of
    width `roll_w` (cm), for a whole *order* of items sharing the same material — or, later,
    for a batch of items pooled from many separate approved orders/quotes. Deliberately kept
    order-agnostic (it only knows about pieces, not who they belong to) so the same function
    can drive both today's per-order nesting and a future "nest everything approved for
    production today" batch job without changes.

    `pieces`: list of {"w", "h", "qty", "ref"} dicts (cm; `ref` is an opaque id the caller
    attaches to trace a placement back to its source item/order).

    Returns {"shelves": [...], "total_length_cm": float, "used_area_cm2": float, "unfit": [...]}
    — `unfit` lists pieces that don't fit the roll width at all (in either orientation); the
    caller is responsible for pricing/warning about those separately."""
    units = []
    unfit = []
    for p in pieces:
        w, h, qty, ref = p["w"], p["h"], p["qty"], p.get("ref")
        if w <= 0 or h <= 0 or qty <= 0:
            continue
        fits_upright = w <= roll_w
        fits_rotated = h <= roll_w
        if not fits_upright and not fits_rotated:
            unfit.append(p)
            continue
        # Prefer the given orientation; rotate only if it's the only one that fits.
        uw, uh = (w, h) if fits_upright else (h, w)
        for _ in range(qty):
            units.append((uw, uh, ref))

    # Next-fit-decreasing-height shelf packing: tallest pieces first, fill each shelf's
    # width left-to-right, start a new shelf once the current one can't fit the next piece.
    units.sort(key=lambda u: u[1], reverse=True)
    shelves = []
    shelf = None
    for uw, uh, ref in units:
        if shelf is not None and shelf["used_width"] + uw <= roll_w + 1e-9:
            shelf["items"].append({"x": shelf["used_width"], "w": uw, "h": uh, "ref": ref})
            shelf["used_width"] += uw
            shelf["height"] = max(shelf["height"], uh)
        else:
            if shelf is not None:
                shelves.append(shelf)
            shelf = {"height": uh, "used_width": uw, "items": [{"x": 0, "w": uw, "h": uh, "ref": ref}]}
    if shelf is not None:
        shelves.append(shelf)

    total_length = sum(s["height"] for s in shelves)
    used_area = sum(it["w"] * it["h"] for s in shelves for it in s["items"])
    return {
        "shelves": shelves,
        "total_length_cm": total_length,
        "used_area_cm2": used_area,
        "unfit": unfit,
    }


def apply_material_minimums(row_dict, actual_sqm, actual_length_m, warnings):
    """Given a material's already-computed job consumption (`actual_sqm`, and
    `actual_length_m` if it's a roll material whose layout is known), bump the price up to
    whatever per-material minimums apply (min_sqm / min_linear_m / min_price), appending an
    explanatory warning — including how much more can be used for the same price — for each
    minimum that kicks in. Shared by both single-item quotes and multi-item orders so the
    same material behaves identically in either flow. Returns (price, actual_sqm) —
    actual_sqm may itself be raised by a min_sqm minimum."""
    price_per_sqm = row_dict["price_per_sqm"]
    name = row_dict["name"]

    min_sqm_mat = row_dict.get("min_sqm") or 0
    if min_sqm_mat > 0 and actual_sqm < min_sqm_mat:
        extra_sqm = min_sqm_mat - actual_sqm
        actual_sqm = min_sqm_mat
        warnings.append(
            f"הופעל מ\"ר מינימום עבור '{name}' (מינ' {min_sqm_mat} מ\"ר) — "
            f"ניתן לנצל עוד כ-{extra_sqm:.2f} מ\"ר באותו מחיר"
        )

    price = price_per_sqm * actual_sqm

    min_linear_m = row_dict.get("min_linear_m") or 0
    if min_linear_m > 0 and actual_length_m is not None and actual_length_m < min_linear_m:
        extra_length = min_linear_m - actual_length_m
        max_w = row_dict.get("max_width") or 0
        min_sqm_from_linear = min_linear_m * (max_w / 100)
        min_price_from_linear = price_per_sqm * min_sqm_from_linear
        if min_price_from_linear > price:
            price = min_price_from_linear
            warnings.append(
                f"הופעל מטר רץ מינימלי עבור '{name}' (מינ' {min_linear_m} מ') — "
                f"ניתן לנצל עוד כ-{extra_length:.2f} מ' באותו מחיר"
            )

    min_price = row_dict.get("min_price") or 0
    if min_price > 0 and price < min_price:
        msg = f"הופעל מחיר מינימום עבור '{name}' (מינ' ₪{min_price} לעבודה)"
        if price_per_sqm > 0:
            max_sqm_at_min = min_price / price_per_sqm
            extra_sqm = max_sqm_at_min - actual_sqm
            if extra_sqm > 0.01:
                msg += f" — ניתן לנצל עוד כ-{extra_sqm:.2f} מ\"ר באותו מחיר"
        price = min_price
        warnings.append(msg)

    return price, actual_sqm


def compute_quote(conn, data: QuoteRequest, user_id=None, discount_override=None):
    sqm = (data.width_cm / 100) * (data.height_cm / 100)
    sqm = max(sqm, 0.1)
    discount_percent = 0
    warnings = []

    if user_id:
        user_row = conn.execute("SELECT discount_percent FROM users WHERE id=?", (user_id,)).fetchone()
        if user_row:
            discount_percent = user_row["discount_percent"] or 0

    # Manual override takes precedence
    if discount_override is not None:
        discount_percent = discount_override

    def get_price(mat_id, category):
        if not mat_id:
            return 0, "ללא", None, None
        row = conn.execute("SELECT * FROM materials WHERE id=?", (mat_id,)).fetchone()
        if not row:
            warnings.append(f"חומר שנבחר (מזהה #{mat_id}) לא נמצא במערכת — ייתכן שהמחירון התאפס לאחר דיפלוי. בחר/י את החומר מחדש.")
            return 0, "לא נמצא", None, None
        row_dict = dict(row)

        # Check dimension constraints
        max_w = row_dict.get("max_width") or 0
        max_l = row_dict.get("max_length") or 0
        if max_w > 0 and max_l > 0:
            req_min = min(data.width_cm, data.height_cm)
            req_max = max(data.width_cm, data.height_cm)
            mat_min = min(max_w, max_l)
            mat_max = max(max_w, max_l)
            if req_min > mat_min or req_max > mat_max:
                warnings.append(f"מידות חריגות עבור '{row_dict['name']}' (מקס' {max_w}×{max_l} ס\"מ)")
        elif max_w > 0 and data.width_cm > max_w:
            warnings.append(f"רוחב חריג עבור '{row_dict['name']}' (מקס' {max_w} ס\"מ)")
        elif max_l > 0 and data.height_cm > max_l:
            warnings.append(f"אורך חריג עבור '{row_dict['name']}' (מקס' {max_l} ס\"מ)")

        # Roll materials (max_width set): figure out the actual sheet layout FIRST.
        # All minimums below are checked against what actually gets cut from the roll
        # (including layout waste), not against the flat per-item area.
        layout = None
        if max_w > 0:
            layout = _fit_layout(data.width_cm, data.height_cm, data.quantity, max_w)

        if layout:
            actual_sqm = (max_w / 100) * (layout["required_length_cm"] / 100)
            actual_length_m = layout["required_length_cm"] / 100
        else:
            actual_sqm = sqm * data.quantity
            actual_length_m = None

        price, _ = apply_material_minimums(row_dict, actual_sqm, actual_length_m, warnings)

        return price, row_dict["name"], row_dict, layout

    print_price, print_name, print_row, print_layout = get_price(data.print_material_id, "PRINT")
    base_price, base_name, base_row, _ = get_price(data.base_material_id, "BASE")
    lam_price, lam_name, lam_row, _ = get_price(data.lamination_id, "LAMINATION")

    total_before_discount = print_price + base_price + lam_price
    discount_amount = total_before_discount * (discount_percent / 100.0)
    total_after_discount = total_before_discount - discount_amount
    vat_amount = total_after_discount * 0.18  # VAT 18%
    final_total = total_after_discount + vat_amount

    # Layout details (admin-only in the UI) — reuses the exact layout used for pricing above,
    # so the numbers shown always match what was actually charged.
    layout_details = None
    if print_layout and print_row:
        roll_w = print_row["max_width"]
        best_len = print_layout["required_length_cm"]
        qty = data.quantity
        used_area = (data.width_cm / 100) * (data.height_cm / 100) * qty
        total_roll_area = (roll_w / 100) * (best_len / 100)
        waste_percent = max(0, ((total_roll_area - used_area) / total_roll_area) * 100) if total_roll_area > 0 else 0
        layout_details = {
            "roll_width_m": round(roll_w / 100, 2),
            "required_length_m": round(best_len / 100, 2),
            "columns": print_layout["cols"],
            "rows": print_layout["rows"],
            "is_rotated": print_layout["is_rotated"],
            "waste_percent": round(waste_percent, 1)
        }

    return {
        "sqm": round(sqm, 4),
        "quantity": data.quantity,
        "print": {"name": print_name, "price": round(print_price, 2)},
        "base": {"name": base_name, "price": round(base_price, 2)},
        "lamination": {"name": lam_name, "price": round(lam_price, 2)},
        "subtotal": round(total_before_discount, 2),
        "discount_percent": discount_percent,
        "discount_amount": round(discount_amount, 2),
        "total_after_discount": round(total_after_discount, 2),
        "vat_amount": round(vat_amount, 2),
        "total": round(final_total, 2),
        "warnings": warnings,
        "layout": layout_details,
        "width_cm": data.width_cm,
        "height_cm": data.height_cm,
    }


def compute_order(conn, items: List[OrderItemIn], user_id=None, discount_override=None):
    """Price a whole multi-item order/cart together: items that share the same material
    (per role — print/base/lamination) are nested onto that material's roll as ONE combined
    job via fit_layout_multi(), so the price reflects what actually gets cut from the roll
    across the whole order, and any per-material minimum is only charged once for the whole
    group — not once per tiny line item. Non-roll (fixed-size sheet) materials have no shared
    roll to nest onto, so they're still priced per item."""
    discount_percent = 0
    warnings = []
    if user_id:
        user_row = conn.execute("SELECT discount_percent FROM users WHERE id=?", (user_id,)).fetchone()
        if user_row:
            discount_percent = user_row["discount_percent"] or 0
    if discount_override is not None:
        discount_percent = discount_override

    item_prices = [{"print": 0.0, "base": 0.0, "lamination": 0.0} for _ in items]
    item_names = [{"print": "ללא", "base": "ללא", "lamination": "ללא"} for _ in items]
    groups_out = []

    def price_role(role, mat_id_attr):
        by_material = {}
        for idx, it in enumerate(items):
            mat_id = getattr(it, mat_id_attr)
            if not mat_id:
                continue
            by_material.setdefault(mat_id, []).append(idx)

        for mat_id, idxs in by_material.items():
            row = conn.execute("SELECT * FROM materials WHERE id=?", (mat_id,)).fetchone()
            if not row:
                warnings.append(f"חומר שנבחר (מזהה #{mat_id}) לא נמצא במערכת — ייתכן שהמחירון התאפס לאחר דיפלוי. בחר/י את החומר מחדש עבור פריט #{idxs[0] + 1}.")
                for idx in idxs:
                    item_names[idx][role] = "לא נמצא"
                continue
            row_dict = dict(row)
            name = row_dict["name"]
            max_w = row_dict.get("max_width") or 0
            max_l = row_dict.get("max_length") or 0

            for idx in idxs:
                item_names[idx][role] = name

            fit_idxs = []
            for idx in idxs:
                it = items[idx]
                if max_w > 0 and max_l > 0:
                    req_min, req_max = min(it.width_cm, it.height_cm), max(it.width_cm, it.height_cm)
                    mat_min, mat_max = min(max_w, max_l), max(max_w, max_l)
                    if req_min > mat_min or req_max > mat_max:
                        warnings.append(f"מידות חריגות עבור '{name}' (מקס' {max_w}×{max_l} ס\"מ) — פריט #{idx + 1}")
                        continue
                elif max_w > 0 and it.width_cm > max_w:
                    warnings.append(f"רוחב חריג עבור '{name}' (מקס' {max_w} ס\"מ) — פריט #{idx + 1}")
                    continue
                elif max_l > 0 and it.height_cm > max_l:
                    warnings.append(f"אורך חריג עבור '{name}' (מקס' {max_l} ס\"מ) — פריט #{idx + 1}")
                    continue
                fit_idxs.append(idx)

            if not fit_idxs:
                continue

            if max_w > 0:
                pieces = [{"w": items[idx].width_cm, "h": items[idx].height_cm,
                           "qty": items[idx].quantity, "ref": idx} for idx in fit_idxs]
                nest = fit_layout_multi(pieces, max_w)
                for p in nest["unfit"]:
                    warnings.append(f"מידות חריגות עבור '{name}' — פריט #{p['ref'] + 1} לא נכנס לרוחב הגליל ({max_w} ס\"מ)")
                packed_idxs = [idx for idx in fit_idxs if idx not in {p["ref"] for p in nest["unfit"]}]
                if not packed_idxs:
                    continue

                total_len_m = nest["total_length_cm"] / 100
                actual_sqm = (max_w / 100) * total_len_m
                group_price, actual_sqm = apply_material_minimums(row_dict, actual_sqm, total_len_m, warnings)

                flat_areas = {idx: (items[idx].width_cm / 100) * (items[idx].height_cm / 100) * items[idx].quantity
                              for idx in packed_idxs}
                total_flat = sum(flat_areas.values()) or 1
                for idx in packed_idxs:
                    item_prices[idx][role] = group_price * (flat_areas[idx] / total_flat)

                used_area = sum(flat_areas.values())
                total_roll_area = (max_w / 100) * total_len_m
                waste_percent = max(0, ((total_roll_area - used_area) / total_roll_area) * 100) if total_roll_area > 0 else 0

                groups_out.append({
                    "role": role, "material_name": name, "material_id": mat_id,
                    "roll_width_m": round(max_w / 100, 2),
                    "required_length_m": round(total_len_m, 2),
                    "waste_percent": round(waste_percent, 1),
                    "price": round(group_price, 2),
                    "shelves": nest["shelves"],
                    "item_refs": packed_idxs,
                })
            else:
                for idx in fit_idxs:
                    it = items[idx]
                    item_sqm = max((it.width_cm / 100) * (it.height_cm / 100), 0.1) * it.quantity
                    price, _ = apply_material_minimums(row_dict, item_sqm, None, warnings)
                    item_prices[idx][role] = price

    price_role("print", "print_material_id")
    price_role("base", "base_material_id")
    price_role("lamination", "lamination_id")

    items_out = []
    total_before_discount = 0.0
    for idx, it in enumerate(items):
        line_total = item_prices[idx]["print"] + item_prices[idx]["base"] + item_prices[idx]["lamination"]
        total_before_discount += line_total
        items_out.append({
            "width_cm": it.width_cm, "height_cm": it.height_cm, "quantity": it.quantity,
            "print": {"name": item_names[idx]["print"], "price": round(item_prices[idx]["print"], 2)},
            "base": {"name": item_names[idx]["base"], "price": round(item_prices[idx]["base"], 2)},
            "lamination": {"name": item_names[idx]["lamination"], "price": round(item_prices[idx]["lamination"], 2)},
            "line_total": round(line_total, 2),
        })

    discount_amount = total_before_discount * (discount_percent / 100.0)
    total_after_discount = total_before_discount - discount_amount
    vat_amount = total_after_discount * 0.18  # VAT 18%
    final_total = total_after_discount + vat_amount

    return {
        "items": items_out,
        "groups": groups_out,
        "subtotal": round(total_before_discount, 2),
        "discount_percent": discount_percent,
        "discount_amount": round(discount_amount, 2),
        "total_after_discount": round(total_after_discount, 2),
        "vat_amount": round(vat_amount, 2),
        "total": round(final_total, 2),
        "warnings": warnings,
    }


# ─── Auth Endpoints ────────────────────────────────────────────────────────────
@app.post("/api/auth/admin/login")
def admin_login(data: AdminLogin):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM admins WHERE username=? AND password_hash=?",
            (data.username, hash_password(data.password))
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="שם משתמש או סיסמה שגויים")
    token = create_token({"sub": data.username, "role": "admin", "id": row["id"]})
    return {"access_token": token, "token_type": "bearer", "role": "admin"}


@app.post("/api/auth/login")
def user_login(data: UserLogin):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email=? AND password_hash=?",
            (data.email, hash_password(data.password))
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="אימייל או סיסמה שגויים")
    token = create_token({
        "sub": data.email,
        "role": "user",
        "id": row["id"],
        "name": f"{row['first_name']} {row['last_name']}"
    })
    return {"access_token": token, "token_type": "bearer", "role": "user",
            "name": f"{row['first_name']} {row['last_name']}"}


@app.post("/api/auth/phone-login")
def phone_login(data: PhoneLogin):
    phone = data.phone.strip().replace("-", "")
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE REPLACE(phone, '-', '') = ?",
            (phone,)
        ).fetchone()
    if not row:
        return {"status": "new", "phone": data.phone.strip()}
    token = create_token({
        "sub": row["phone"],
        "role": "user",
        "id": row["id"],
        "name": f"{row['first_name']} {row['last_name']}"
    })
    return {
        "status": "ok",
        "access_token": token,
        "token_type": "bearer",
        "role": "user",
        "name": f"{row['first_name']} {row['last_name']}"
    }


@app.post("/api/auth/phone-register")
def phone_register(data: PhoneRegister):
    phone = data.phone.strip().replace("-", "")
    with get_db() as conn:
        try:
            cur = conn.execute(
                """INSERT INTO users (first_name, last_name, email, phone, company_name, invoice_name, tax_id, password_hash)
                   VALUES (?, ?, ?, ?, ?, ?, ?, '')""",
                (data.first_name, data.last_name, data.email or "",
                 phone, data.company_name or "", data.invoice_name or "", data.tax_id or "")
            )
            user_id = cur.lastrowid
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="מספר טלפון כבר קיים במערכת")
    name = f"{data.first_name} {data.last_name}"
    token = create_token({"sub": phone, "role": "user", "id": user_id, "name": name})
    return {"access_token": token, "token_type": "bearer", "role": "user", "name": name}


@app.post("/api/users/register")
def register_user(data: UserRegister):
    with get_db() as conn:
        try:
            conn.execute(
                """INSERT INTO users (first_name, last_name, email, phone, company_name, address, password_hash)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (data.first_name, data.last_name, data.email, data.phone,
                 data.company_name, data.address, hash_password(data.password))
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="אימייל כבר קיים במערכת")
    return {"message": "Registration successful"}


# ─── Public Endpoints ──────────────────────────────────────────────────────────
@app.get("/api/materials")
def get_materials():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT m.*, c.name as category_name, c.display_name as category_display
            FROM materials m JOIN categories c ON m.category_id = c.id
            WHERE m.active = 1
            ORDER BY c.id, m.name
        """).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/categories")
def get_categories():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM categories ORDER BY id").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/quotes/calculate")
def calculate_quote(data: QuoteRequest, credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    user_id = payload.get("id") if payload.get("role") == "user" else None

    with get_db() as conn:
        breakdown = compute_quote(conn, data, user_id=user_id)
        import json
        conn.execute("""
            INSERT INTO quotes (user_id, width_cm, height_cm, sqm, print_material_id,
                base_material_id, lamination_id, quantity, total_price, breakdown)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, data.width_cm, data.height_cm, breakdown["sqm"],
              data.print_material_id, data.base_material_id, data.lamination_id,
              data.quantity, breakdown["total"], json.dumps(breakdown, ensure_ascii=False)))

    return breakdown


# ─── File Upload & Object Detection ─────────────────────────────────────────────
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15MB


def detect_object_bbox(img):
    """Return a normalized (0..1) bounding box {x0,y0,x1,y1} around the non-background
    content of `img` — lets a customer print just their logo/graphic instead of the whole
    (possibly padded) canvas. Uses the alpha channel when the image has real transparency,
    otherwise treats near-white pixels as background."""
    rgba = img.convert("RGBA")
    alpha = rgba.split()[-1]
    if alpha.getextrema() != (255, 255):
        mask = alpha.point(lambda a: 255 if a > 10 else 0)
    else:
        gray = rgba.convert("RGB").convert("L")
        mask = gray.point(lambda p: 255 if p < 245 else 0)
    bbox = mask.getbbox()
    w, h = img.size
    if not bbox:
        return {"x0": 0.0, "y0": 0.0, "x1": 1.0, "y1": 1.0}
    x0, y0, x1, y1 = bbox
    return {"x0": x0 / w, "y0": y0 / h, "x1": x1 / w, "y1": y1 / h}


@app.post("/api/files/upload")
async def upload_file(file: UploadFile = File(...), user=Depends(get_current_user)):
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="הקובץ גדול מהמותר (מקסימום 15MB)")

    content_type = file.content_type or ""
    is_pdf = content_type == "application/pdf" or (file.filename or "").lower().endswith(".pdf")
    original_data = None
    original_content_type = None

    if is_pdf:
        try:
            doc = pymupdf.open(stream=raw, filetype="pdf")
            pix = doc[0].get_pixmap(dpi=150)
            data = pix.tobytes("png")
            doc.close()
        except Exception:
            raise HTTPException(status_code=400, detail="לא ניתן לקרוא את קובץ ה-PDF")
        original_data, original_content_type = raw, "application/pdf"
        content_type = "image/png"
    elif content_type.startswith("image/"):
        try:
            probe = Image.open(io.BytesIO(raw))
            probe.verify()
        except Exception:
            raise HTTPException(status_code=400, detail="קובץ התמונה פגום או לא נתמך")
        data = raw
    else:
        raise HTTPException(status_code=400, detail="פורמט קובץ לא נתמך (תמונה או PDF בלבד)")

    img = Image.open(io.BytesIO(data))
    width_px, height_px = img.size

    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO order_files (filename, content_type, data, width_px, height_px,
                original_content_type, original_data)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (file.filename, content_type, data, width_px, height_px,
             original_content_type, original_data)
        )
        file_id = cur.lastrowid

    return {"id": file_id, "filename": file.filename, "content_type": content_type,
            "width_px": width_px, "height_px": height_px}


@app.get("/api/files/{file_id}/raw")
def get_file_raw(file_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT data, content_type FROM order_files WHERE id=?", (file_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="קובץ לא נמצא")
    return Response(content=row["data"], media_type=row["content_type"] or "application/octet-stream")


@app.post("/api/files/{file_id}/detect-object")
def detect_object(file_id: int, user=Depends(get_current_user)):
    with get_db() as conn:
        row = conn.execute(
            "SELECT data, width_px, height_px FROM order_files WHERE id=?", (file_id,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="קובץ לא נמצא")
    try:
        img = Image.open(io.BytesIO(row["data"]))
    except Exception:
        raise HTTPException(status_code=400, detail="לא ניתן לנתח את הקובץ")
    return {"bbox": detect_object_bbox(img), "width_px": row["width_px"], "height_px": row["height_px"]}


# ─── Orders (multi-item cart) ───────────────────────────────────────────────────
def _save_order(conn, items: List[OrderItemIn], breakdown: dict, user_id):
    import json
    cur = conn.execute(
        "INSERT INTO orders (user_id, total_price, breakdown) VALUES (?, ?, ?)",
        (user_id, breakdown["total"], json.dumps(breakdown, ensure_ascii=False))
    )
    order_id = cur.lastrowid
    for i, it in enumerate(items):
        conn.execute(
            """INSERT INTO order_items (order_id, width_cm, height_cm, quantity,
                print_material_id, base_material_id, lamination_id, file_id, offset_cm, price)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (order_id, it.width_cm, it.height_cm, it.quantity,
             it.print_material_id, it.base_material_id, it.lamination_id,
             it.file_id, it.offset_cm or 0, breakdown["items"][i]["line_total"])
        )
    return order_id


@app.post("/api/orders/calculate")
def calculate_order(data: OrderCalculateRequest, credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    user_id = payload.get("id") if payload.get("role") == "user" else None
    with get_db() as conn:
        breakdown = compute_order(conn, data.items, user_id=user_id)
        if data.save_order:
            breakdown["id"] = _save_order(conn, data.items, breakdown, user_id)
    return breakdown


@app.get("/api/products")
def get_products():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT p.*,
                   bm.name as base_material_name,
                   pm.name as print_material_name,
                   lm.name as lamination_name
            FROM products p
            LEFT JOIN materials bm ON p.base_material_id = bm.id
            LEFT JOIN materials pm ON p.print_material_id = pm.id
            LEFT JOIN materials lm ON p.lamination_id = lm.id
            WHERE p.active = 1
        """).fetchall()
    return [dict(r) for r in rows]


# ─── Admin Endpoints ───────────────────────────────────────────────────────────
@app.get("/api/admin/materials")
def admin_get_materials(admin=Depends(get_current_admin)):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT m.*, c.name as category_name, c.display_name as category_display
            FROM materials m JOIN categories c ON m.category_id = c.id
            ORDER BY c.id, m.name
        """).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/admin/materials")
def admin_create_material(data: MaterialCreate, admin=Depends(get_current_admin)):
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO materials (category_id, name, price_per_sqm, min_sqm, max_width, max_length, min_price, min_linear_m)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (data.category_id, data.name, data.price_per_sqm, data.min_sqm or 0.1,
             data.max_width or 0, data.max_length or 0, data.min_price or 0, data.min_linear_m or 0)
        )
    return {"id": cur.lastrowid, "message": "חומר נוסף בהצלחה"}


@app.put("/api/admin/materials/{material_id}")
def admin_update_material(material_id: int, data: MaterialUpdate, admin=Depends(get_current_admin)):
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="אין שינויים לעדכן")
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_db() as conn:
        conn.execute(f"UPDATE materials SET {set_clause} WHERE id=?", (*updates.values(), material_id))
    return {"message": "חומר עודכן בהצלחה"}


@app.delete("/api/admin/materials/{material_id}")
def admin_delete_material(material_id: int, admin=Depends(get_current_admin)):
    with get_db() as conn:
        conn.execute("DELETE FROM materials WHERE id=?", (material_id,))
    return {"message": "חומר נמחק"}


@app.get("/api/admin/users")
def admin_get_users(admin=Depends(get_current_admin)):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, first_name, last_name, email, phone, company_name, invoice_name, tax_id, address, discount_percent, created_at FROM users"
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/admin/users")
def admin_create_user(data: AdminUserCreate, admin=Depends(get_current_admin)):
    """Register a walk-in customer directly from the admin panel (e.g. while
    generating a quote at the counter). No password is set — the customer can
    log in later via phone, same as self-registration by phone."""
    phone = (data.phone or "").strip().replace("-", "")
    with get_db() as conn:
        try:
            cur = conn.execute(
                """INSERT INTO users (first_name, last_name, email, phone, company_name,
                    invoice_name, tax_id, address, discount_percent, password_hash)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')""",
                (data.first_name, data.last_name, data.email or "", phone,
                 data.company_name or "", data.invoice_name or "", data.tax_id or "",
                 data.address or "", data.discount_percent or 0)
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="לקוח עם פרטים אלו כבר קיים במערכת")
        user_id = cur.lastrowid
        row = conn.execute(
            "SELECT id, first_name, last_name, email, phone, company_name, invoice_name, tax_id, address, discount_percent, created_at FROM users WHERE id=?",
            (user_id,)
        ).fetchone()
    return dict(row)


@app.put("/api/admin/users/{user_id}")
def admin_update_user(user_id: int, data: UserUpdate, admin=Depends(get_current_admin)):
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="אין שינויים לעדכן")
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_db() as conn:
        conn.execute(f"UPDATE users SET {set_clause} WHERE id=?", (*updates.values(), user_id))
    return {"message": "הלקוח עודכן בהצלחה"}


@app.get("/api/admin/quotes")
def admin_get_quotes(admin=Depends(get_current_admin)):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT q.*, u.first_name || ' ' || u.last_name as user_name, u.email, u.phone
            FROM quotes q LEFT JOIN users u ON q.user_id = u.id
            ORDER BY q.created_at DESC LIMIT 200
        """).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/admin/quotes/{quote_id}")
def admin_get_quote(quote_id: int, admin=Depends(get_current_admin)):
    with get_db() as conn:
        row = conn.execute("""
            SELECT q.*, u.first_name || ' ' || u.last_name as user_name,
                   u.email, u.phone, u.discount_percent as user_discount
            FROM quotes q LEFT JOIN users u ON q.user_id = u.id
            WHERE q.id=?
        """, (quote_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="הצעה לא נמצאה")
    return dict(row)


@app.put("/api/admin/quotes/{quote_id}")
def admin_update_quote(quote_id: int, data: QuoteUpdate, admin=Depends(get_current_admin)):
    # Editing a quote keeps the original as history and saves the edit as a new quote,
    # linked back to the one it was edited from.
    import json
    with get_db() as conn:
        # Get existing quote
        existing = conn.execute("SELECT * FROM quotes WHERE id=?", (quote_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="הצעה לא נמצאה")
        existing = dict(existing)

        # Merge with updates
        merged = QuoteRequest(
            width_cm=data.width_cm if data.width_cm is not None else existing["width_cm"],
            height_cm=data.height_cm if data.height_cm is not None else existing["height_cm"],
            quantity=data.quantity if data.quantity is not None else existing["quantity"],
            print_material_id=data.print_material_id if data.print_material_id is not None else existing["print_material_id"],
            base_material_id=data.base_material_id if data.base_material_id is not None else existing["base_material_id"],
            lamination_id=data.lamination_id if data.lamination_id is not None else existing["lamination_id"],
        )

        discount_override = data.discount_override
        breakdown = compute_quote(conn, merged, user_id=existing["user_id"], discount_override=discount_override)
        breakdown["replaces_quote_id"] = quote_id

        cur = conn.execute("""
            INSERT INTO quotes (user_id, width_cm, height_cm, sqm, print_material_id,
                base_material_id, lamination_id, quantity, total_price, breakdown)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (existing["user_id"], merged.width_cm, merged.height_cm, breakdown["sqm"],
              merged.print_material_id, merged.base_material_id, merged.lamination_id,
              merged.quantity, breakdown["total"],
              json.dumps(breakdown, ensure_ascii=False)))
        breakdown["id"] = cur.lastrowid

    return breakdown


@app.post("/api/admin/quotes/calculate")
def admin_calculate_quote(data: AdminQuoteRequest, admin=Depends(get_current_admin)):
    import json
    req = QuoteRequest(
        width_cm=data.width_cm,
        height_cm=data.height_cm,
        quantity=data.quantity,
        print_material_id=data.print_material_id,
        base_material_id=data.base_material_id,
        lamination_id=data.lamination_id,
    )
    with get_db() as conn:
        breakdown = compute_quote(conn, req, user_id=data.user_id, discount_override=data.discount_override)
        if data.save_quote:
            conn.execute("""
                INSERT INTO quotes (user_id, width_cm, height_cm, sqm, print_material_id,
                    base_material_id, lamination_id, quantity, total_price, breakdown)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (data.user_id, data.width_cm, data.height_cm, breakdown["sqm"],
                  data.print_material_id, data.base_material_id, data.lamination_id,
                  data.quantity, breakdown["total"], json.dumps(breakdown, ensure_ascii=False)))
    return breakdown


@app.post("/api/admin/orders/calculate")
def admin_calculate_order(data: OrderCalculateRequest, admin=Depends(get_current_admin)):
    with get_db() as conn:
        breakdown = compute_order(conn, data.items, user_id=data.user_id, discount_override=data.discount_override)
        if data.save_order:
            breakdown["id"] = _save_order(conn, data.items, breakdown, data.user_id)
    return breakdown


@app.get("/api/admin/orders")
def admin_get_orders(admin=Depends(get_current_admin)):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT o.*, u.first_name || ' ' || u.last_name as user_name, u.phone
            FROM orders o LEFT JOIN users u ON o.user_id = u.id
            ORDER BY o.created_at DESC LIMIT 200
        """).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/admin/orders/{order_id}")
def admin_get_order(order_id: int, admin=Depends(get_current_admin)):
    with get_db() as conn:
        row = conn.execute("""
            SELECT o.*, u.first_name || ' ' || u.last_name as user_name, u.phone
            FROM orders o LEFT JOIN users u ON o.user_id = u.id
            WHERE o.id=?
        """, (order_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="הזמנה לא נמצאה")
        items = conn.execute("SELECT * FROM order_items WHERE order_id=?", (order_id,)).fetchall()
    result = dict(row)
    result["items_raw"] = [dict(i) for i in items]
    return result


@app.post("/api/admin/products")
def admin_create_product(data: ProductCreate, admin=Depends(get_current_admin)):
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO products (name, base_material_id, print_material_id, lamination_id) VALUES (?, ?, ?, ?)",
            (data.name, data.base_material_id, data.print_material_id, data.lamination_id)
        )
    return {"id": cur.lastrowid, "message": "מוצר נוסף בהצלחה"}


@app.put("/api/admin/products/{product_id}")
def admin_update_product(product_id: int, data: ProductUpdate, admin=Depends(get_current_admin)):
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="אין שינויים לעדכן")
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_db() as conn:
        conn.execute(f"UPDATE products SET {set_clause} WHERE id=?", (*updates.values(), product_id))
    return {"message": "המוצר עודכן בהצלחה"}


@app.delete("/api/admin/products/{product_id}")
def admin_delete_product(product_id: int, admin=Depends(get_current_admin)):
    with get_db() as conn:
        conn.execute("DELETE FROM products WHERE id=?", (product_id,))
    return {"message": "המוצר נמחק"}


from fastapi.staticfiles import StaticFiles

if os.path.isdir("dist"):
    app.mount("/", StaticFiles(directory="dist", html=True), name="static")
else:
    @app.get("/")
    def root():
        return {"message": "שלטי הצפון API - v4.0", "docs": "/docs"}


# ─── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    init_db()
    print("[OK] Database initialized")
    print("[INFO] Admin: admin / admin123")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("pricing_v4_auth:app", host="0.0.0.0", port=8000, reload=True)
