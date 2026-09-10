"""
שלטי הצפון - Backend API
FastAPI + SQLite + JWT Authentication
"""

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
import sqlite3
import hashlib
import jwt
import os
from datetime import datetime, timedelta
from contextlib import contextmanager

# ─── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "shlate-tzafon-secret-key-change-in-production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24
DB_PATH = "pricing_v4.db"

app = FastAPI(title="שלטי הצפון API", version="4.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

# ─── Database ──────────────────────────────────────────────────────────────────
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
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                email TEXT DEFAULT '',
                phone TEXT UNIQUE NOT NULL,
                company_name TEXT DEFAULT '',
                address TEXT DEFAULT '',
                invoice_name TEXT DEFAULT '',
                tax_id TEXT DEFAULT '',
                password_hash TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)

        # Migration: add new columns if missing (for existing DBs)
        try:
            cur.execute("ALTER TABLE users ADD COLUMN invoice_name TEXT DEFAULT ''")
        except sqlite3.OperationalError:
            pass
        try:
            cur.execute("ALTER TABLE users ADD COLUMN tax_id TEXT DEFAULT ''")
        except sqlite3.OperationalError:
            pass

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
                active INTEGER DEFAULT 1,
                FOREIGN KEY (category_id) REFERENCES categories(id)
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

class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    price_per_sqm: Optional[float] = None
    min_sqm: Optional[float] = None
    category_id: Optional[int] = None
    active: Optional[int] = None

class QuoteRequest(BaseModel):
    width_cm: float
    height_cm: float
    quantity: int = 1
    print_material_id: Optional[int] = None
    base_material_id: Optional[int] = None
    lamination_id: Optional[int] = None


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
    """Login by phone number. Returns token if found, or status='new' if not."""
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
    """Register a new user by phone and auto-login."""
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
    token = create_token({
        "sub": phone,
        "role": "user",
        "id": user_id,
        "name": name
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "user",
        "name": name
    }


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
        rows = conn.execute("SELECT * FROM categories").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/quotes/calculate")
def calculate_quote(data: QuoteRequest, credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    user_id = payload.get("id") if payload.get("role") == "user" else None

    sqm = (data.width_cm / 100) * (data.height_cm / 100)
    sqm = max(sqm, 0.1)  # minimum 0.1 sqm

    breakdown = {}
    total = 0.0

    with get_db() as conn:
        def get_price(mat_id, category):
            if not mat_id:
                return 0, "ללא"
            row = conn.execute("SELECT * FROM materials WHERE id=?", (mat_id,)).fetchone()
            if not row:
                return 0, "לא נמצא"
            price = row["price_per_sqm"] * sqm * data.quantity
            return price, row["name"]

        print_price, print_name = get_price(data.print_material_id, "PRINT")
        base_price, base_name = get_price(data.base_material_id, "BASE")
        lam_price, lam_name = get_price(data.lamination_id, "LAMINATION")

        total = print_price + base_price + lam_price
        breakdown = {
            "sqm": round(sqm, 4),
            "quantity": data.quantity,
            "print": {"name": print_name, "price": round(print_price, 2)},
            "base": {"name": base_name, "price": round(base_price, 2)},
            "lamination": {"name": lam_name, "price": round(lam_price, 2)},
            "total": round(total, 2)
        }

        import json
        conn.execute("""
            INSERT INTO quotes (user_id, width_cm, height_cm, sqm, print_material_id,
                base_material_id, lamination_id, quantity, total_price, breakdown)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, data.width_cm, data.height_cm, sqm,
              data.print_material_id, data.base_material_id, data.lamination_id,
              data.quantity, total, json.dumps(breakdown, ensure_ascii=False)))

    return breakdown


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
            "INSERT INTO materials (category_id, name, price_per_sqm, min_sqm) VALUES (?, ?, ?, ?)",
            (data.category_id, data.name, data.price_per_sqm, data.min_sqm)
        )
    return {"id": cur.lastrowid, "message": "חומר נוסף בהצלחה"}


@app.put("/api/admin/materials/{material_id}")
def admin_update_material(material_id: int, data: MaterialUpdate, admin=Depends(get_current_admin)):
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="אין שינויים לעדכן")
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_db() as conn:
        conn.execute(
            f"UPDATE materials SET {set_clause} WHERE id=?",
            (*updates.values(), material_id)
        )
    return {"message": "עודכן בהצלחה"}


@app.delete("/api/admin/materials/{material_id}")
def admin_delete_material(material_id: int, admin=Depends(get_current_admin)):
    with get_db() as conn:
        conn.execute("UPDATE materials SET active=0 WHERE id=?", (material_id,))
    return {"message": "חומר הוסר"}


@app.get("/api/admin/users")
def admin_get_users(admin=Depends(get_current_admin)):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, first_name, last_name, email, phone, company_name, invoice_name, tax_id, address, created_at FROM users"
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/admin/quotes")
def admin_get_quotes(admin=Depends(get_current_admin)):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT q.*, u.first_name || ' ' || u.last_name as user_name, u.email
            FROM quotes q LEFT JOIN users u ON q.user_id = u.id
            ORDER BY q.created_at DESC LIMIT 100
        """).fetchall()
    return [dict(r) for r in rows]


@app.get("/")
def root():
    return {"message": "🛑 שלטי הצפון API - v4.0", "docs": "/docs"}


# ─── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    init_db()
    print("[OK] Database initialized")
    print("[INFO] Admin: admin / admin123")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("pricing_v4_auth:app", host="0.0.0.0", port=8000, reload=True)
