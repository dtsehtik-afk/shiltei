import { useState, useEffect } from "react";
import "./App.css";

const API = import.meta.env.MODE === 'development' ? "http://localhost:8000" : "https://shiltei.onrender.com";

// ─── API Helper ────────────────────────────────────────────────────────────────
async function apiCall(endpoint, method = "GET", body = null, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "שגיאה בשרת");
  return data;
}

async function uploadFile(file, token) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/api/files/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "שגיאה בהעלאת הקובץ");
  return data;
}

async function detectObject(fileId, token) {
  return apiCall(`/api/files/${fileId}/detect-object`, "POST", null, token);
}

// Print only one specific section (by class name) as its own separate print job,
// leaving every other section (including sections not meant for this viewer, like
// an admin-only cutting layout) out of that print job entirely.
function printSection(sectionClass) {
  const el = document.querySelector("." + sectionClass);
  if (!el) { window.print(); return; }
  document.body.classList.add("printing-section");
  el.setAttribute("data-print-active", "true");
  window.print();
  el.removeAttribute("data-print-active");
  document.body.classList.remove("printing-section");
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [role, setRole] = useState(localStorage.getItem("role") || null);
  const [userName, setUserName] = useState(localStorage.getItem("userName") || "");
  const [screen, setScreen] = useState("login"); // login | admin | user

  useEffect(() => {
    if (token && role === "admin") setScreen("admin");
    else if (token && role === "user") setScreen("user");
    else setScreen("login");
  }, [token, role]);

  function logout() {
    localStorage.clear();
    setToken(null);
    setRole(null);
    setUserName("");
    setScreen("login");
  }

  function onLogin(tok, rl, name = "") {
    localStorage.setItem("token", tok);
    localStorage.setItem("role", rl);
    localStorage.setItem("userName", name);
    setToken(tok);
    setRole(rl);
    setUserName(name);
  }

  return (
    <div className="app" dir="rtl">
      <Header role={role} userName={userName} onLogout={logout} screen={screen} setScreen={setScreen} />
      <main className="main">
        {screen === "login" && <LoginScreen onLogin={onLogin} />}
        {screen === "admin" && <AdminPanel token={token} />}
        {screen === "user" && <UserPanel token={token} userName={userName} />}
      </main>
      <footer className="footer">
        <p>שלטי הצפון © {new Date().getFullYear()} | כל הזכויות שמורות</p>
      </footer>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ role, userName, onLogout, screen, setScreen }) {
  return (
    <header className="header">
      <div className="header-brand">
        <img src="/logo.png" alt="שלטי הצפון" className="brand-logo" />
        <p className="brand-sub">מערכת תמחור מתקדמת</p>
      </div>
      {role && (
        <div className="header-actions">
          <span className="user-badge">
            {role === "admin" ? "👑 מנהל" : `👤 ${userName}`}
          </span>
          <button className="btn btn-outline" onClick={onLogout}>יציאה</button>
        </div>
      )}
    </header>
  );
}

// ─── Login Screen (Phone-based for customers) ────────────────────────────────
function LoginScreen({ onLogin }) {
  const [tab, setTab] = useState("user"); // user | admin
  const [phone, setPhone] = useState("");
  const [adminForm, setAdminForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Phone flow states
  const [phoneStep, setPhoneStep] = useState("phone"); // phone | register | welcome
  const [welcomeName, setWelcomeName] = useState("");
  const [welcomeToken, setWelcomeToken] = useState(null);
  const [regForm, setRegForm] = useState({
    first_name: "", last_name: "", invoice_name: "",
    tax_id: "", email: "", company_name: ""
  });

  // Admin login
  async function handleAdminLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await apiCall("/api/auth/admin/login", "POST", {
        username: adminForm.username,
        password: adminForm.password,
      });
      onLogin(data.access_token, "admin");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Phone login — step 1
  async function handlePhoneCheck(e) {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiCall("/api/auth/phone-login", "POST", { phone: phone.trim() });
      if (data.status === "ok") {
        // Known user → show welcome, then auto-login
        setWelcomeName(data.name);
        setWelcomeToken(data.access_token);
        setPhoneStep("welcome");
        setTimeout(() => {
          onLogin(data.access_token, "user", data.name);
        }, 1800);
      } else {
        // New user → show registration form
        setPhoneStep("register");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Phone register — step 2
  async function handlePhoneRegister(e) {
    e.preventDefault();
    if (!regForm.first_name.trim() || !regForm.last_name.trim()) {
      setError("שם פרטי ושם משפחה הם שדות חובה");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiCall("/api/auth/phone-register", "POST", {
        phone: phone.trim(),
        first_name: regForm.first_name,
        last_name: regForm.last_name,
        invoice_name: regForm.invoice_name,
        tax_id: regForm.tax_id,
        email: regForm.email,
        company_name: regForm.company_name,
      });
      setWelcomeName(data.name);
      setWelcomeToken(data.access_token);
      setPhoneStep("welcome");
      setTimeout(() => {
        onLogin(data.access_token, "user", data.name);
      }, 1800);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Welcome screen
  if (phoneStep === "welcome") {
    return (
      <div className="auth-container">
        <div className="card auth-card text-center welcome-card">
          <div className="welcome-emoji">👋</div>
          <h2 className="welcome-title">שלום, {welcomeName}!</h2>
          <p className="welcome-sub">מעביר אותך לפורטל...</p>
          <div className="welcome-loader"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="card auth-card">
        <div className="card-icon">🔐</div>
        <h2>כניסה למערכת</h2>

        <div className="tab-group">
          <button
            className={`tab ${tab === "user" ? "active" : ""}`}
            onClick={() => { setTab("user"); setError(""); setPhoneStep("phone"); }}
          >
            👤 לקוח
          </button>
          <button
            className={`tab ${tab === "admin" ? "active" : ""}`}
            onClick={() => { setTab("admin"); setError(""); }}
          >
            👑 מנהל
          </button>
        </div>

        {tab === "admin" ? (
          <form onSubmit={handleAdminLogin} className="form">
            <div className="form-group">
              <label>שם משתמש</label>
              <input
                type="text"
                placeholder="admin"
                value={adminForm.username}
                onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>סיסמה</label>
              <input
                type="password"
                placeholder="••••••••"
                value={adminForm.password}
                onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                required
              />
            </div>
          {error && <div className="alert alert-error">{error}</div>}
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? "מתחבר..." : "כניסה"}
            </button>
          </form>
        ) : phoneStep === "phone" ? (
          <form onSubmit={handlePhoneCheck} className="form">
            <div className="form-group">
              <label>📱 מספר טלפון</label>
              <input
                type="tel"
                placeholder="050-0000000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="phone-input"
                autoFocus
              />
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? "בודק..." : "📲 כניסה"}
            </button>
            <p className="auth-hint">הכנס מספר טלפון לכניסה מהירה או הרשמה</p>
          </form>
        ) : (
          /* phoneStep === "register" */
          <form onSubmit={handlePhoneRegister} className="form">
            <div className="register-phone-badge">
              📱 {phone}
              <button type="button" className="link-btn" onClick={() => setPhoneStep("phone")}>שנה</button>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>שם פרטי *</label>
                <input
                  type="text" placeholder="ישראל" value={regForm.first_name}
                  onChange={(e) => setRegForm({ ...regForm, first_name: e.target.value })}
                  required autoFocus
                />
              </div>
              <div className="form-group">
                <label>שם משפחה *</label>
                <input
                  type="text" placeholder="ישראלי" value={regForm.last_name}
                  onChange={(e) => setRegForm({ ...regForm, last_name: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>שם לחשבונית</label>
                <input
                  type="text" placeholder="שם העסק בע״מ" value={regForm.invoice_name}
                  onChange={(e) => setRegForm({ ...regForm, invoice_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>ח.פ / עוסק מורשה</label>
                <input
                  type="text" placeholder="51-1234567" value={regForm.tax_id}
                  onChange={(e) => setRegForm({ ...regForm, tax_id: e.target.value })}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>אימייל</label>
                <input
                  type="email" placeholder="israel@company.co.il" value={regForm.email}
                  onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>שם חברה</label>
                <input
                  type="text" placeholder="חברה בע״מ" value={regForm.company_name}
                  onChange={(e) => setRegForm({ ...regForm, company_name: e.target.value })}
                />
              </div>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? "נרשם..." : "✅ הרשמה וכניסה"}
            </button>
            <p className="auth-hint">שדות עם * הם חובה</p>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Edit Material Modal ──────────────────────────────────────────────────────
function EditMaterialModal({ material, categories, onSave, onClose }) {
  const [form, setForm] = useState({
    name: material.name,
    price_per_sqm: material.price_per_sqm,
    min_sqm: material.min_sqm || 0.1,
    max_width: material.max_width || '',
    max_length: material.max_length || '',
    min_price: material.min_price || '',
    min_linear_m: material.min_linear_m || '',
    min_unit: material.min_linear_m > 0 ? 'linear' : 'sqm',
    category_id: material.category_id,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onSave(material.id, {
        name: form.name,
        price_per_sqm: parseFloat(form.price_per_sqm),
        min_sqm: form.min_unit === 'sqm' ? parseFloat(form.min_sqm) || 0.1 : 0.1,
        max_width: form.max_width !== '' ? parseFloat(form.max_width) : 0,
        max_length: form.max_length !== '' ? parseFloat(form.max_length) : 0,
        min_price: form.min_price !== '' ? parseFloat(form.min_price) : 0,
        min_linear_m: form.min_unit === 'linear' ? parseFloat(form.min_linear_m) || 0 : 0,
        category_id: parseInt(form.category_id),
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>✏️ עריכת חומר</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSave} className="form">
          <div className="form-group">
            <label>קטגוריה</label>
            <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} required>
              {categories.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>שם החומר</label>
            <input type="text" value={form.name}
              onChange={e => setForm({...form, name: e.target.value})} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>מחיר למ"ר (₪)</label>
              <input type="number" step="0.01" value={form.price_per_sqm}
                onChange={e => setForm({...form, price_per_sqm: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>מחיר מינימום לעבודה (₪)</label>
              <input type="number" step="0.01" placeholder="ללא מינימום" value={form.min_price}
                onChange={e => setForm({...form, min_price: e.target.value})} />
            </div>
          </div>
          <div className="form-group">
            <label>מידה מינימלית לחיוב</label>
            <div className="form-row" style={{gap: '8px', alignItems: 'center'}}>
              <select value={form.min_unit} onChange={e => setForm({...form, min_unit: e.target.value})}
                style={{flex: '0 0 140px'}}>
                <option value="sqm">מ"ר מינימום</option>
                <option value="linear">מטר רץ מינימום</option>
              </select>
              {form.min_unit === 'sqm' ? (
                <input type="number" step="0.01" placeholder="0.1" value={form.min_sqm}
                  onChange={e => setForm({...form, min_sqm: e.target.value})} style={{flex: 1}} />
              ) : (
                <input type="number" step="0.1" placeholder='למשל: 1.5' value={form.min_linear_m}
                  onChange={e => setForm({...form, min_linear_m: e.target.value})} style={{flex: 1}} />
              )}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>רוחב מקסימלי (ס"מ) — ריק = ∞</label>
              <input type="number" step="0.1" placeholder="∞ ללא הגבלה" value={form.max_width}
                onChange={e => setForm({...form, max_width: e.target.value})} />
            </div>
            <div className="form-group">
              <label>אורך מקסימלי (ס"מ) — ריק = ∞</label>
              <input type="number" step="0.1" placeholder="∞ ללא הגבלה" value={form.max_length}
                onChange={e => setForm({...form, max_length: e.target.value})} />
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "שומר..." : "💾 שמור"}
            </button>
            <button type="button" className="btn btn-outline" onClick={onClose}>ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
// ─── Edit User Modal ────────────────────────────────────────────────────────
function EditUserModal({ user, onSave, onClose }) {
  const [discount, setDiscount] = useState(user.discount_percent || 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onSave(user.id, { discount_percent: parseInt(discount) });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>✏️ עריכת לקוח: {user.first_name} {user.last_name}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSave} className="form">
          <div className="form-group">
            <label>אחוז הנחה (%)</label>
            <input type="number" min="0" max="100" value={discount}
              onChange={e => setDiscount(e.target.value)} required />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "שומר..." : "💾 שמור"}
            </button>
            <button type="button" className="btn btn-outline" onClick={onClose}>ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ─── Add User Modal (admin creates a walk-in customer) ────────────────────────
function AddUserModal({ initialName, onSave, onClose }) {
  const parts = (initialName || "").trim().split(/\s+/);
  const [form, setForm] = useState({
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" ") || "",
    phone: "",
    email: "",
    company_name: "",
    invoice_name: "",
    tax_id: "",
    discount_percent: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onSave({
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone,
        email: form.email,
        company_name: form.company_name,
        invoice_name: form.invoice_name,
        tax_id: form.tax_id,
        discount_percent: form.discount_percent ? parseInt(form.discount_percent) : 0,
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>➕ הוספת לקוח חדש</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSave} className="form">
          <div className="form-row">
            <div className="form-group">
              <label>שם פרטי</label>
              <input type="text" value={form.first_name}
                onChange={e => setForm({...form, first_name: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>שם משפחה</label>
              <input type="text" value={form.last_name}
                onChange={e => setForm({...form, last_name: e.target.value})} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>טלפון</label>
              <input type="text" dir="ltr" value={form.phone}
                onChange={e => setForm({...form, phone: e.target.value})} />
            </div>
            <div className="form-group">
              <label>אימייל</label>
              <input type="email" dir="ltr" value={form.email}
                onChange={e => setForm({...form, email: e.target.value})} />
            </div>
          </div>
          <div className="form-group">
            <label>שם חברה</label>
            <input type="text" value={form.company_name}
              onChange={e => setForm({...form, company_name: e.target.value})} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>שם לחשבונית</label>
              <input type="text" value={form.invoice_name}
                onChange={e => setForm({...form, invoice_name: e.target.value})} />
            </div>
            <div className="form-group">
              <label>ח.פ / ע.מ</label>
              <input type="text" dir="ltr" value={form.tax_id}
                onChange={e => setForm({...form, tax_id: e.target.value})} />
            </div>
            <div className="form-group">
              <label>הנחה (%)</label>
              <input type="number" min="0" max="100" value={form.discount_percent}
                onChange={e => setForm({...form, discount_percent: e.target.value})} />
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "מוסיף..." : "💾 הוסף לקוח"}
            </button>
            <button type="button" className="btn btn-outline" onClick={onClose}>ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}


function ProductsAdminTab({ token, materials }) {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: '', print_material_id: '', base_material_id: '', lamination_id: '' });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const byCategory = (name) => materials.filter(m => m.category_name === name);

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    const data = await apiCall('/api/products', 'GET', null, token);
    setProducts(data);
  }

  async function addProduct(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiCall('/api/admin/products', 'POST', {
        name: form.name,
        print_material_id: form.print_material_id ? parseInt(form.print_material_id) : null,
        base_material_id: form.base_material_id ? parseInt(form.base_material_id) : null,
        lamination_id: form.lamination_id ? parseInt(form.lamination_id) : null,
      }, token);
      setForm({ name: '', print_material_id: '', base_material_id: '', lamination_id: '' });
      setMsg('✅ מוצר נוסף בהצלחה!');
      loadProducts();
    } catch (err) {
      setMsg('❌ ' + err.message);
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(''), 3000);
    }
  }

  async function deleteProduct(id) {
    if (!confirm('למחוק מוצר מדף זה?')) return;
    await apiCall(`/api/admin/products/${id}`, 'DELETE', null, token);
    loadProducts();
  }

  return (
    <div>
      <div className='card'>
        <h3>➕ הוסף מוצר מדף</h3>
        <form onSubmit={addProduct} className='form'>
          <div className='form-group'>
            <label>שם המוצר</label>
            <input type='text' value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
          </div>
          <div className='form-row'>
            <div className='form-group'>
              <label>חומר הדפסה</label>
              <select value={form.print_material_id} onChange={e => setForm({...form, print_material_id: e.target.value})}>
                <option value=''>ללא הדפסה</option>
                {byCategory('PRINT').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className='form-group'>
              <label>חומר רקע</label>
              <select value={form.base_material_id} onChange={e => setForm({...form, base_material_id: e.target.value})}>
                <option value=''>ללא רקע</option>
                {byCategory('BASE').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className='form-group'>
              <label>למינציה</label>
              <select value={form.lamination_id} onChange={e => setForm({...form, lamination_id: e.target.value})}>
                <option value=''>ללא למינציה</option>
                {byCategory('LAMINATION').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <button type='submit' className='btn btn-primary' disabled={loading}>
            {loading ? 'מוסיף...' : 'הוסף מוצר'}
          </button>
        </form>
        {msg && <div className='alert'>{msg}</div>}
      </div>

      <div className='card'>
        <h3>🛍️ מוצרי מדף</h3>
        <div className='table-wrap'>
          <table className='table'>
            <thead>
              <tr><th>שם מוצר</th><th>הדפסה</th><th>רקע</th><th>למינציה</th><th>פעולות</th></tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.print_material_name || '-'}</td>
                  <td>{p.base_material_name || '-'}</td>
                  <td>{p.lamination_name || '-'}</td>
                  <td>
                    <button className='btn btn-sm btn-danger' onClick={() => deleteProduct(p.id)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Manual object selector (fallback when auto-detection isn't confirmed) ─────
function ManualCropSelector({ src, onConfirm, onCancel }) {
  const [rect, setRect] = useState(null);
  const [dragStart, setDragStart] = useState(null);

  function pointFromEvent(e) {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1),
      y: Math.min(Math.max((e.clientY - box.top) / box.height, 0), 1),
    };
  }
  function handlePointerDown(e) {
    const p = pointFromEvent(e);
    setDragStart(p);
    setRect({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }
  function handlePointerMove(e) {
    if (!dragStart) return;
    const p = pointFromEvent(e);
    setRect({
      x0: Math.min(dragStart.x, p.x), y0: Math.min(dragStart.y, p.y),
      x1: Math.max(dragStart.x, p.x), y1: Math.max(dragStart.y, p.y),
    });
  }

  const valid = rect && (rect.x1 - rect.x0) > 0.02 && (rect.y1 - rect.y0) > 0.02;

  return (
    <div>
      <p style={{fontSize: '0.85rem', margin: '6px 0'}}>גרור על התמונה כדי לסמן את האובייקט</p>
      <div
        style={{position: 'relative', display: 'inline-block', touchAction: 'none', cursor: 'crosshair', maxWidth: '100%'}}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDragStart(null)}
      >
        <img src={src} style={{display: 'block', maxWidth: '260px', maxHeight: '260px', userSelect: 'none'}} draggable={false} />
        {rect && (
          <div style={{
            position: 'absolute',
            left: `${rect.x0 * 100}%`, top: `${rect.y0 * 100}%`,
            width: `${(rect.x1 - rect.x0) * 100}%`, height: `${(rect.y1 - rect.y0) * 100}%`,
            border: '2px dashed #6c3fc5', background: 'rgba(108,63,197,0.15)', boxSizing: 'border-box',
          }} />
        )}
      </div>
      <div style={{marginTop: '8px', display: 'flex', gap: '8px'}}>
        <button type='button' className='btn btn-primary' disabled={!valid} onClick={() => onConfirm(rect)}>✅ אשר בחירה</button>
        <button type='button' className='btn btn-outline' onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

// ─── Artwork upload + whole-file/object scoping + offset + size ───────────────
function ArtworkPicker({ token, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [scope, setScope] = useState(null); // 'whole' | 'object'
  const [autoBbox, setAutoBbox] = useState(null);
  const [stage, setStage] = useState(null); // 'confirm' | 'manual' | 'done'
  const [finalBbox, setFinalBbox] = useState(null);
  const [offsetCm, setOffsetCm] = useState(0);
  const [objW, setObjW] = useState('');
  const [objH, setObjH] = useState('');

  const previewUrl = file ? `${API}/api/files/${file.id}/raw` : null;
  const aspect = (file && finalBbox)
    ? ((finalBbox.x1 - finalBbox.x0) * file.width_px) / ((finalBbox.y1 - finalBbox.y0) * file.height_px)
    : null;

  async function handleFileSelect(e) {
    const f = e.target.files[0];
    if (!f) return;
    setUploading(true); setError('');
    setScope(null); setFinalBbox(null); setStage(null); setAutoBbox(null);
    setObjW(''); setObjH('');
    try {
      const uploaded = await uploadFile(f, token);
      setFile(uploaded);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function chooseWholeFile() {
    setScope('whole');
    setFinalBbox({x0: 0, y0: 0, x1: 1, y1: 1});
    setStage('done');
  }

  async function chooseObject() {
    setScope('object');
    setError('');
    try {
      const res = await detectObject(file.id, token);
      setAutoBbox(res.bbox);
      setStage('confirm');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!file || !finalBbox || !onChange) return;
    const w = parseFloat(objW), h = parseFloat(objH);
    if (!w || !h) return;
    onChange({
      file_id: file.id,
      width_cm: w + offsetCm * 2,
      height_cm: h + offsetCm * 2,
      offset_cm: offsetCm,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, finalBbox, objW, objH, offsetCm]);

  return (
    <div className='artwork-picker'>
      <label style={{display: 'block', marginBottom: '6px', fontSize: '0.85rem'}}>קובץ עיצוב (תמונה / PDF) — אופציונלי</label>
      <input type='file' accept='image/*,application/pdf' onChange={handleFileSelect} disabled={uploading} />
      {uploading && <div style={{fontSize: '0.85rem'}}>מעלה...</div>}
      {error && <div className='alert alert-error' style={{marginTop: '6px'}}>{error}</div>}

      {file && (
        <div style={{marginTop: '10px'}}>
          {!scope && (
            <>
              <img src={previewUrl} style={{maxWidth: '160px', maxHeight: '160px', display: 'block', border: '1px solid #ddd', borderRadius: '4px'}} />
              <p style={{fontSize: '0.85rem', margin: '8px 0 4px'}}>להתייחס לכל הקובץ או רק לאובייקט שבתוכו?</p>
              <div style={{display: 'flex', gap: '8px'}}>
                <button type='button' className='btn btn-outline' onClick={chooseWholeFile}>📄 כל הקובץ</button>
                <button type='button' className='btn btn-outline' onClick={chooseObject}>✂️ רק האובייקט</button>
              </div>
            </>
          )}

          {stage === 'confirm' && autoBbox && (
            <div>
              <div style={{position: 'relative', display: 'inline-block'}}>
                <img src={previewUrl} style={{maxWidth: '260px', maxHeight: '260px', display: 'block'}} />
                <div style={{
                  position: 'absolute',
                  left: `${autoBbox.x0 * 100}%`, top: `${autoBbox.y0 * 100}%`,
                  width: `${(autoBbox.x1 - autoBbox.x0) * 100}%`, height: `${(autoBbox.y1 - autoBbox.y0) * 100}%`,
                  border: '2px dashed #6c3fc5', background: 'rgba(108,63,197,0.15)', boxSizing: 'border-box',
                }} />
              </div>
              <p style={{fontSize: '0.85rem', margin: '6px 0'}}>זה האובייקט שזוהה?</p>
              <div style={{display: 'flex', gap: '8px'}}>
                <button type='button' className='btn btn-primary' onClick={() => { setFinalBbox(autoBbox); setStage('done'); }}>✅ כן, נכון</button>
                <button type='button' className='btn btn-outline' onClick={() => setStage('manual')}>✏️ לא, אסמן ידנית</button>
              </div>
            </div>
          )}

          {stage === 'manual' && (
            <ManualCropSelector
              src={previewUrl}
              onConfirm={(rect) => { setFinalBbox(rect); setStage('done'); }}
              onCancel={() => setStage('confirm')}
            />
          )}

          {stage === 'done' && finalBbox && (
            <div style={{marginTop: '10px'}}>
              <div className='form-row'>
                <div className='form-group'>
                  <label>רוחב האובייקט (ס"מ)</label>
                  <input type='number' step='0.1' value={objW}
                    onChange={e => {
                      const v = e.target.value; setObjW(v);
                      if (aspect && v) setObjH((parseFloat(v) / aspect).toFixed(1));
                    }} />
                </div>
                <div className='form-group'>
                  <label>גובה האובייקט (ס"מ)</label>
                  <input type='number' step='0.1' value={objH}
                    onChange={e => {
                      const v = e.target.value; setObjH(v);
                      if (aspect && v) setObjW((parseFloat(v) * aspect).toFixed(1));
                    }} />
                </div>
                <div className='form-group'>
                  <label>מסגרת/אופסט מסביב (ס"מ)</label>
                  <input type='number' step='0.1' min='0' value={offsetCm}
                    onChange={e => setOffsetCm(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
              <p style={{fontSize: '0.8rem', opacity: 0.75}}>היחס בין רוחב לגובה נשמר אוטומטית לפי האובייקט/קובץ שנבחר.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── One line item in a multi-item order/cart ──────────────────────────────────
function CartItemRow({ index, item, materials, products, onChange, onRemove, token }) {
  const byCategory = (name) => materials.filter(m => m.category_name === name && m.active);

  function update(patch) {
    onChange(index, {...item, ...patch});
  }

  return (
    <div className='card' style={{marginBottom: '10px', background: 'var(--surface-2, rgba(0,0,0,0.02))'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <h4 style={{margin: 0}}>פריט #{index + 1}</h4>
        <button type='button' className='btn btn-sm btn-danger' onClick={() => onRemove(index)}>🗑️ הסר</button>
      </div>
      {products?.length > 0 && (
        <div className='form-group'>
          <label>🛍️ בחירת מוצר מהיר (אופציונלי)</label>
          <select value={item.product_id || ''} onChange={e => {
            const pid = e.target.value;
            const prod = products.find(p => p.id == pid);
            if (prod) {
              update({
                product_id: pid,
                print_material_id: prod.print_material_id || '',
                base_material_id: prod.base_material_id || '',
                lamination_id: prod.lamination_id || '',
              });
            } else {
              update({product_id: ''});
            }
          }}>
            <option value=''>-- בנייה אישית --</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      <div className='form-row'>
        <div className='form-group'>
          <label>רוחב (ס"מ){item.from_artwork ? ' — מהעיצוב' : ''}</label>
          <input type='number' step='0.1' value={item.width_cm}
            onChange={e => update({width_cm: e.target.value, from_artwork: false})} required />
        </div>
        <div className='form-group'>
          <label>גובה (ס"מ){item.from_artwork ? ' — מהעיצוב' : ''}</label>
          <input type='number' step='0.1' value={item.height_cm}
            onChange={e => update({height_cm: e.target.value, from_artwork: false})} required />
        </div>
        <div className='form-group'>
          <label>כמות</label>
          <input type='number' min='1' value={item.quantity}
            onChange={e => update({quantity: e.target.value})} required />
        </div>
      </div>
      <div className='form-row'>
        <div className='form-group'>
          <label>🖨️ הדפסה</label>
          <select value={item.print_material_id} onChange={e => update({print_material_id: e.target.value})}>
            <option value=''>ללא</option>
            {byCategory('PRINT').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className='form-group'>
          <label>🪵 בסיס</label>
          <select value={item.base_material_id} onChange={e => update({base_material_id: e.target.value})}>
            <option value=''>ללא</option>
            {byCategory('BASE').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className='form-group'>
          <label>✨ למינציה</label>
          <select value={item.lamination_id} onChange={e => update({lamination_id: e.target.value})}>
            <option value=''>ללא</option>
            {byCategory('LAMINATION').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>
      <ArtworkPicker token={token} onChange={(art) => update({
        file_id: art.file_id, width_cm: art.width_cm.toFixed(1), height_cm: art.height_cm.toFixed(1),
        offset_cm: art.offset_cm, from_artwork: true,
      })} />
    </div>
  );
}

const emptyCartItem = () => ({
  width_cm: '', height_cm: '', quantity: 1,
  print_material_id: '', base_material_id: '', lamination_id: '',
  file_id: null, offset_cm: 0,
});

// ─── Multi-item order/cart: combined nesting across all items per material ────
function OrderCartTab({ token, materials, products, users, isAdmin, onAddUser, title, initialItems, editOrderId }) {
  const [items, setItems] = useState(() => (initialItems && initialItems.length > 0) ? initialItems : [emptyCartItem()]);
  const [userId, setUserId] = useState('');
  const [discountOverride, setDiscountOverride] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function addRow() { setItems(prev => [...prev, emptyCartItem()]); }
  function updateRow(idx, newItem) { setItems(prev => prev.map((it, i) => i === idx ? newItem : it)); }
  function removeRow(idx) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  async function handleAddUser(data) {
    const newUser = await onAddUser(data);
    setUserId(String(newUser.id));
    setNewCustomerName('');
    setShowAddUser(false);
    return newUser;
  }

  async function calculate(e) {
    e.preventDefault();
    setLoading(true); setError(''); setResult(null);
    try {
      const payload = {
        items: items.map(it => ({
          width_cm: parseFloat(it.width_cm),
          height_cm: parseFloat(it.height_cm),
          quantity: parseInt(it.quantity) || 1,
          print_material_id: it.print_material_id ? parseInt(it.print_material_id) : null,
          base_material_id: it.base_material_id ? parseInt(it.base_material_id) : null,
          lamination_id: it.lamination_id ? parseInt(it.lamination_id) : null,
          file_id: it.file_id || null,
          offset_cm: it.offset_cm || 0,
        })),
        save_order: true,
      };
      let res;
      if (editOrderId) {
        if (isAdmin) {
          payload.user_id = userId ? parseInt(userId) : null;
          payload.discount_override = discountOverride !== '' ? parseFloat(discountOverride) : null;
          res = await apiCall(`/api/admin/orders/${editOrderId}`, 'PUT', payload, token);
        } else {
          res = await apiCall(`/api/orders/my/${editOrderId}`, 'PUT', payload, token);
        }
      } else if (isAdmin) {
        payload.user_id = userId ? parseInt(userId) : null;
        payload.discount_override = discountOverride !== '' ? parseFloat(discountOverride) : null;
        res = await apiCall('/api/admin/orders/calculate', 'POST', payload, token);
      } else {
        res = await apiCall('/api/orders/calculate', 'POST', payload, token);
      }
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className='card'>
        <h3>{editOrderId ? `✏️ עריכת הצעה #${editOrderId}` : (title || '📋 הפקת הצעת מחיר')}</h3>

        {isAdmin && (
          <div className='form'>
            <div className='form-row'>
              <div className='form-group'>
                <label>לקוח (אופציונלי)</label>
                <select value={userId} onChange={e => setUserId(e.target.value)}>
                  <option value=''>-- ללא שיוך לקוח --</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.phone})</option>)}
                </select>
              </div>
              <div className='form-group'>
                <label>הנחה ידנית (%) — ריק = לפי לקוח</label>
                <input type='number' min='0' max='100' step='0.5' value={discountOverride}
                  onChange={e => setDiscountOverride(e.target.value)} />
              </div>
            </div>
            <div className='form-row'>
              <div className='form-group' style={{flex: 1}}>
                <label>לקוח חדש בדלפק? הכנס שם ולחץ "הוסף לקוח חדש"</label>
                <div style={{display: 'flex', gap: '8px'}}>
                  <input type='text' placeholder='שם הלקוח' style={{flex: 1}} value={newCustomerName}
                    onChange={e => setNewCustomerName(e.target.value)} />
                  <button type='button' className='btn btn-outline' onClick={() => setShowAddUser(true)}>➕ הוסף לקוח חדש</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {items.map((item, idx) => (
          <CartItemRow key={idx} index={idx} item={item} materials={materials} products={products}
            onChange={updateRow} onRemove={removeRow} token={token} />
        ))}
        <button type='button' className='btn btn-outline' onClick={addRow}>➕ הוספת פריט</button>

        {error && <div className='alert alert-error' style={{marginTop: '10px'}}>{error}</div>}
        <div style={{marginTop: '14px'}}>
          <button className='btn btn-primary btn-full' onClick={calculate} disabled={loading || items.length === 0}>
            {loading ? 'מחשב...' : (editOrderId ? '💾 עדכן הצעה' : '🧮 חשב הצעה')}
          </button>
        </div>
      </div>

      {result && <OrderResultView result={result} isAdmin={isAdmin} />}

      {showAddUser && (
        <AddUserModal initialName={newCustomerName} onSave={handleAddUser} onClose={() => setShowAddUser(false)} />
      )}
    </div>
  );
}

// ─── Shared result view for a computed order (used inline after calculating, and
// when an admin reopens a previously saved order) ──────────────────────────────
const ORDER_ROLE_LABEL = {print: '🖨️ הדפסה', base: '🪵 בסיס', lamination: '✨ למינציה'};

function OrderResultView({ result, isAdmin }) {
  return (
    <div className='card result-card' style={{marginTop: '16px'}}>
      <div className='print-order-body'>
        <div className='quote-header'>
          <div><h1 className='quote-title'>הצעת מחיר</h1></div>
          <div className='quote-logo'>
            <img src='/logo.png' alt='שלטי הצפון' style={{height: '40px'}} />
          </div>
        </div>
        <table className='quote-table'>
          <thead><tr><th>#</th><th>מידות (ס"מ)</th><th>כמות</th><th>חומרים</th><th>סה"כ</th></tr></thead>
          <tbody>
            {result.items.map((it, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td dir='ltr'>{it.width_cm} × {it.height_cm}</td>
                <td>{it.quantity}</td>
                <td>
                  <div>🖨️ {it.print?.name && it.print.name !== 'ללא' ? it.print.name : 'ללא הדפסה'}</div>
                  {it.base?.name && it.base.name !== 'ללא' && (
                    <div style={{fontSize: '0.85em', opacity: 0.75, paddingRight: '14px'}}>↳ 🪵 בסיס: {it.base.name}</div>
                  )}
                  {it.lamination?.name && it.lamination.name !== 'ללא' && (
                    <div style={{fontSize: '0.85em', opacity: 0.75, paddingRight: '14px'}}>↳ ✨ למינציה: {it.lamination.name}</div>
                  )}
                </td>
                <td>₪{it.line_total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.warnings?.length > 0 && (
          <div className='quote-warnings'>
            {result.warnings.map((w, i) => <div key={i} className='quote-warning-item'>⚠️ {w}</div>)}
          </div>
        )}
        <div className='quote-summary'>
          {result.discount_amount > 0 && (<>
            <div className='quote-summary-row'><span>לפני הנחה:</span><span>₪{result.subtotal.toFixed(2)}</span></div>
            <div className='quote-summary-row'><span>הנחה ({result.discount_percent}%):</span><span style={{color: 'red'}}>-₪{result.discount_amount.toFixed(2)}</span></div>
          </>)}
          <div className='quote-summary-row'><span>סה"כ לפני מע"מ:</span><span>₪{result.total_after_discount.toFixed(2)}</span></div>
          <div className='quote-summary-row'><span>מע"מ (18%):</span><span>₪{result.vat_amount.toFixed(2)}</span></div>
          <div className='quote-summary-row'><div className='quote-total-box'>סה"כ לתשלום: {result.total.toFixed(2)} ₪</div></div>
        </div>
      </div>

      {isAdmin && (!result.groups || result.groups.length === 0) &&
        result.items.some(it => ['print', 'base', 'lamination'].some(role => it[role]?.name && it[role].name !== 'ללא' && it[role].name !== 'לא נמצא')) && (
        <div className='quote-warnings' style={{marginTop: '16px'}}>
          <div className='quote-warning-item'>
            ℹ️ לא הופקה פריסת גיליון — אף אחד מהחומרים שנבחרו לא מוגדר כחומר גליל.
            כדי לקבל פריסה, יש להגדיר "רוחב מקסימלי" בעריכת החומר (לשונית חומרים).
          </div>
        </div>
      )}

      {isAdmin && result.groups?.length > 0 && (
        <div className='print-order-layout'>
          {result.groups.map((g, gi) => {
            const totalLenCm = g.required_length_m * 100;
            const rollWCm = g.roll_width_m * 100;
            let runningTop = 0;
            return (
              <div key={gi} className='layout-page' style={{marginTop: '16px'}}>
                <h3 className='layout-title'>גיליון פריסה — {g.material_name} ({ORDER_ROLE_LABEL[g.role] || g.role})</h3>
                <div className='layout-meta'>
                  רוחב גליל: {g.roll_width_m} מ' · אורך נדרש: {g.required_length_m} מ' · בזבוז: {g.waste_percent}%
                </div>
                <div style={{position: 'relative', width: '100%', paddingBottom: `${(totalLenCm / rollWCm) * 100}%`, border: '1px solid #1a2a44', background: '#fff', marginTop: '8px'}}>
                  {g.shelves.map((shelf, si) => {
                    const top = runningTop;
                    runningTop += shelf.height;
                    return (
                      <div key={si} style={{
                        position: 'absolute', left: 0, width: '100%',
                        top: `${(top / totalLenCm) * 100}%`, height: `${(shelf.height / totalLenCm) * 100}%`,
                      }}>
                        {shelf.items.map((it, ii) => (
                          <div key={ii} style={{
                            position: 'absolute', left: `${(it.x / rollWCm) * 100}%`, top: 0,
                            width: `${(it.w / rollWCm) * 100}%`, height: '100%',
                            border: '1px solid #6c3fc5', boxSizing: 'border-box',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem',
                          }}>#{it.ref + 1}</div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{textAlign: 'center', marginTop: '20px'}}>
        <button className='btn btn-outline' onClick={() => printSection('print-order-body')}>🖨️ הדפס הצעת מחיר</button>
        {isAdmin && result.groups?.length > 0 && (
          <button className='btn btn-outline' style={{marginRight: '8px'}} onClick={() => printSection('print-order-layout')}>🖨️ הדפס גיליונות פריסה</button>
        )}
      </div>
    </div>
  );
}

// ─── Admin: view a previously saved order ───────────────────────────────────────
function OrderViewModal({ order, token, isAdmin = true, onClose, onDuplicate, onEdit }) {
  const breakdown = order.breakdown ? JSON.parse(order.breakdown) : null;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function fetchItems() {
    const endpoint = isAdmin ? `/api/admin/orders/${order.id}` : `/api/orders/my/${order.id}`;
    const full = await apiCall(endpoint, 'GET', null, token);
    return (full.items_raw || []).map(it => ({
      width_cm: it.width_cm, height_cm: it.height_cm, quantity: it.quantity,
      print_material_id: it.print_material_id || '', base_material_id: it.base_material_id || '',
      lamination_id: it.lamination_id || '', file_id: it.file_id || null, offset_cm: it.offset_cm || 0,
    }));
  }

  async function handleDuplicate() {
    setBusy('duplicate'); setError('');
    try {
      onDuplicate(await fetchItems());
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  }

  async function handleEdit() {
    setBusy('edit'); setError('');
    try {
      onEdit(await fetchItems(), order.id);
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📋 הצעה #{order.id}{order.user_name ? ` — ${order.user_name}` : ''}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{padding: '16px'}}>
          {breakdown ? <OrderResultView result={breakdown} isAdmin={isAdmin} /> : <div>אין פירוט לשמור</div>}
          {error && <div className="alert alert-error" style={{marginTop: '10px'}}>{error}</div>}
          <div style={{textAlign: 'center', marginTop: '12px'}}>
            {onEdit && (
              <button className="btn btn-outline" onClick={handleEdit} disabled={!!busy} style={{marginLeft: '8px'}}>
                {busy === 'edit' ? 'טוען...' : '✏️ ערוך הצעה'}
              </button>
            )}
            {onDuplicate && (
              <button className="btn btn-outline" onClick={handleDuplicate} disabled={!!busy} style={{marginLeft: '8px'}}>
                {busy === 'duplicate' ? 'משכפל...' : '🧬 שכפל הצעה'}
              </button>
            )}
            <button className="btn btn-primary" onClick={onClose}>סגור</button>
          </div>
        </div>
      </div>
    </div>
  );
}


function AdminPanel({ token }) {
  const [tab, setTab] = useState("materials");
  const [materials, setMaterials] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [newMat, setNewMat] = useState({ category_id: '', name: '', price_per_sqm: '', max_width: '', max_length: '', min_price: '', min_linear_m: '', min_unit: 'sqm' });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [orders, setOrders] = useState([]);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [duplicateItems, setDuplicateItems] = useState(null);
  const [duplicateKey, setDuplicateKey] = useState(0);
  const [editOrderId, setEditOrderId] = useState(null);
  const [products, setProducts] = useState([]);

  useEffect(() => { loadMaterials(); loadCategories(); loadUsers(); loadProducts(); }, []);
  useEffect(() => {
    if (tab === 'orders') loadOrders();
  }, [tab]);

  async function loadMaterials() {
    const data = await apiCall("/api/admin/materials", "GET", null, token);
    setMaterials(data);
  }
  async function loadCategories() {
    const data = await apiCall("/api/categories");
    setCategories(data);
  }
  async function loadUsers() {
    const data = await apiCall("/api/admin/users", "GET", null, token);
    setUsers(data);
  }
  async function loadProducts() {
    const data = await apiCall("/api/products");
    setProducts(data);
  }
  async function loadOrders() {
    const data = await apiCall("/api/admin/orders", "GET", null, token);
    setOrders(data);
  }

  async function addMaterial(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiCall("/api/admin/materials", "POST", {
        category_id: parseInt(newMat.category_id),
        name: newMat.name,
        price_per_sqm: parseFloat(newMat.price_per_sqm),
        max_width: newMat.max_width ? parseFloat(newMat.max_width) : 0,
        max_length: newMat.max_length ? parseFloat(newMat.max_length) : 0,
      }, token);
      setNewMat({ category_id: "", name: "", price_per_sqm: "", max_width: "", max_length: "" });
      setMsg("✅ חומר נוסף בהצלחה!");
      loadMaterials();
    } catch (err) {
      setMsg("❌ " + err.message);
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(""), 3000);
    }
  }

  async function deleteMaterial(id) {
    if (!confirm("למחוק חומר זה?")) return;
    await apiCall(`/api/admin/materials/${id}`, "DELETE", null, token);
    loadMaterials();
  }

  async function toggleActive(mat) {
    await apiCall(`/api/admin/materials/${mat.id}`, "PUT",
      { active: mat.active ? 0 : 1 }, token);
    loadMaterials();
  }

  async function saveMaterial(id, updates) {
    await apiCall(`/api/admin/materials/${id}`, "PUT", updates, token);
    setEditingMaterial(null);
    setMsg("✅ חומר עודכן בהצלחה!");
    loadMaterials();
    setTimeout(() => setMsg(""), 3000);
  }

  async function saveUser(id, updates) {
    await apiCall(`/api/admin/users/${id}`, "PUT", updates, token);
    setEditingUser(null);
    setMsg("✅ לקוח עודכן בהצלחה!");
    loadUsers();
    setTimeout(() => setMsg(""), 3000);
  }

  async function addUser(data) {
    const newUser = await apiCall("/api/admin/users", "POST", data, token);
    setShowAddUser(false);
    setMsg("✅ לקוח נוסף בהצלחה!");
    await loadUsers();
    setTimeout(() => setMsg(""), 3000);
    return newUser;
  }

  const catName = (id) => categories.find(c => c.id === id)?.display_name || id;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>👑 פאנל ניהול</h2>
        <div className="tab-group">
          {[["materials","🧱 חומרים"],["products","🛍️ מוצרים"],["users","👥 לקוחות"],["orders","📋 הצעות"],["new-quote","➕ הפק הצעה"]].map(
            ([k, v]) => <button key={k} className={`tab ${tab===k?"active":""}`} onClick={() => {
              if (k === 'new-quote' && tab !== 'new-quote') { setDuplicateItems(null); setEditOrderId(null); }
              setTab(k);
            }}>{v}</button>
          )}
        </div>
      </div>

      {tab === "new-quote" && (
        <OrderCartTab key={duplicateKey} token={token} materials={materials} products={products} users={users}
          isAdmin={true} onAddUser={addUser} initialItems={duplicateItems} editOrderId={editOrderId} />
      )}

      {tab === "products" && <ProductsAdminTab token={token} materials={materials} />}

      {tab === "materials" && (
        <div>
          <div className="card">
            <h3>➕ הוסף חומר חדש</h3>
            <form onSubmit={addMaterial} className='form form-inline'>
              <div className='form-group'>
                <label>קטגוריה</label>
                <select value={newMat.category_id} onChange={e => setNewMat({...newMat, category_id: e.target.value})} required>
                  <option value=''>בחר קטגוריה</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                </select>
              </div>
              <div className='form-group'>
                <label>שם החומר</label>
                <input type='text' placeholder='ויניל גלוס...' value={newMat.name}
                  onChange={e => setNewMat({...newMat, name: e.target.value})} required />
              </div>
              <div className='form-group'>
                <label>מחיר למ"ר (₪)</label>
                <input type='number' step='0.01' placeholder='35.00' value={newMat.price_per_sqm}
                  onChange={e => setNewMat({...newMat, price_per_sqm: e.target.value})} required />
              </div>
              <div className='form-group'>
                <label>מחיר מינימום (₪)</label>
                <input type='number' step='0.01' placeholder='ללא' value={newMat.min_price}
                  onChange={e => setNewMat({...newMat, min_price: e.target.value})} />
              </div>
              <div className='form-group'>
                <label>מינימום לחיוב</label>
                <div style={{display:'flex', gap:'4px'}}>
                  <select value={newMat.min_unit} onChange={e => setNewMat({...newMat, min_unit: e.target.value})} style={{flex:'0 0 110px'}}>
                    <option value='sqm'>מ"ר</option>
                    <option value='linear'>מ' רץ</option>
                  </select>
                  {newMat.min_unit === 'sqm'
                    ? <input type='number' step='0.01' placeholder='0.1' value={newMat.min_sqm || ''} onChange={e => setNewMat({...newMat, min_sqm: e.target.value})} style={{flex:1}} />
                    : <input type='number' step='0.1' placeholder='1.0' value={newMat.min_linear_m} onChange={e => setNewMat({...newMat, min_linear_m: e.target.value})} style={{flex:1}} />
                  }
                </div>
              </div>
              <div className='form-group'>
                <label>רוחב מקס' (ס"מ) — ריק=∞</label>
                <input type='number' step='0.1' placeholder='∞' value={newMat.max_width}
                  onChange={e => setNewMat({...newMat, max_width: e.target.value})} />
              </div>
              <div className='form-group'>
                <label>אורך מקס' (ס"מ) — ריק=∞</label>
                <input type='number' step='0.1' placeholder='∞' value={newMat.max_length}
                  onChange={e => setNewMat({...newMat, max_length: e.target.value})} />
              </div>
              <button type='submit' className='btn btn-primary' disabled={loading}>
                {loading ? '...' : 'הוסף'}
              </button>
            </form>
            {msg && <div className="alert">{msg}</div>}
          </div>

          <div className="card">
            <h3>📦 רשימת חומרים</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>קטגוריה</th><th>שם</th><th>מחיר SQM</th><th>סטטוס</th><th>פעולות</th></tr>
                </thead>
                <tbody>
                  {materials.map(m => (
                    <tr key={m.id} className={!m.active ? "inactive" : ""}>
                      <td><span className="badge">{m.category_display}</span></td>
                      <td>{m.name}</td>
                      <td>₪{m.price_per_sqm.toFixed(2)}</td>
                      <td>
                        <span className={`status ${m.active ? "active" : "inactive"}`}>
                          {m.active ? "פעיל" : "מושבת"}
                        </span>
                      </td>
                      <td className="actions">
                        <button className="btn btn-sm btn-edit" onClick={() => setEditingMaterial(m)} title="עריכה">
                          ✏️
                        </button>
                        <button className="btn btn-sm btn-outline" onClick={() => toggleActive(m)}>
                          {m.active ? "השבת" : "הפעל"}
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteMaterial(m.id)}>
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {editingMaterial && (
            <EditMaterialModal
              material={editingMaterial}
              categories={categories}
              onSave={saveMaterial}
              onClose={() => setEditingMaterial(null)}
            />
          )}
        </div>
      )}

      {tab === "users" && (
        <div className="card">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'8px'}}>
            <h3>👥 לקוחות רשומים ({users.length})</h3>
            <button className="btn btn-outline" onClick={() => setShowAddUser(true)}>➕ הוסף לקוח חדש</button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>שם</th><th>טלפון</th><th>שם לחשבונית</th><th>ח.פ</th><th>אימייל</th><th>הנחה (%)</th><th>תאריך</th><th>פעולות</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.first_name} {u.last_name}</td>
                    <td dir="ltr">{u.phone}</td>
                    <td>{u.invoice_name || "—"}</td>
                    <td dir="ltr">{u.tax_id || "—"}</td>
                    <td>{u.email || "—"}</td>
                    <td>{u.discount_percent || 0}%</td>
                    <td>{new Date(u.created_at).toLocaleDateString("he-IL")}</td>
                    <td>
                      <button className="btn btn-sm btn-edit" onClick={() => setEditingUser(u)} title="עריכה">✏️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editingUser && (
            <EditUserModal
              user={editingUser}
              onSave={saveUser}
              onClose={() => setEditingUser(null)}
            />
          )}
          {showAddUser && (
            <AddUserModal
              onSave={addUser}
              onClose={() => setShowAddUser(false)}
            />
          )}
        </div>
      )}

      {tab === "orders" && (
        <div className="card">
          <h3>📋 הצעות ({orders.length})</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>לקוח</th><th>סה"כ</th><th>תאריך</th><th>פעולות</th></tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id}>
                    <td>{o.user_name || 'אנונימי'}</td>
                    <td className="price">₪{o.total_price.toFixed(2)}</td>
                    <td>{new Date(o.created_at).toLocaleDateString('he-IL')}</td>
                    <td>
                      <button className='btn btn-sm btn-edit' title='צפה' onClick={() => setViewingOrder(o)}>👁️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewingOrder && (
        <OrderViewModal order={viewingOrder} token={token} onClose={() => setViewingOrder(null)}
          onDuplicate={(items) => { setDuplicateItems(items); setEditOrderId(null); setDuplicateKey(k => k + 1); setViewingOrder(null); setTab('new-quote'); }}
          onEdit={(items, id) => { setDuplicateItems(items); setEditOrderId(id); setDuplicateKey(k => k + 1); setViewingOrder(null); setTab('new-quote'); }} />
      )}

    </div>
  );
}

// ─── User Panel ───────────────────────────────────────────────────────────────
function UserPanel({ token, userName }) {
  const [subTab, setSubTab] = useState('new');
  const [materials, setMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [duplicateItems, setDuplicateItems] = useState(null);
  const [duplicateKey, setDuplicateKey] = useState(0);
  const [editOrderId, setEditOrderId] = useState(null);

  useEffect(() => {
    apiCall('/api/materials').then(setMaterials);
    apiCall('/api/products').then(setProducts);
  }, []);

  useEffect(() => {
    if (subTab === 'history') loadMyOrders();
  }, [subTab]);

  async function loadMyOrders() {
    const data = await apiCall('/api/orders/my', 'GET', null, token);
    setMyOrders(data);
  }

  async function viewOrder(o) {
    const full = await apiCall(`/api/orders/my/${o.id}`, 'GET', null, token);
    setViewingOrder(full);
  }

  return (
    <div className='panel'>
      <div className='panel-header'>
        <h2>שלום, {userName}!</h2>
        <p className='subtitle'>בחר חומרים לקבלת הצעת מחיר</p>
        <div className='tab-group'>
          <button className={`tab ${subTab === 'new' ? 'active' : ''}`} onClick={() => {
            if (subTab !== 'new') { setDuplicateItems(null); setEditOrderId(null); }
            setSubTab('new');
          }}>📋 הצעה חדשה</button>
          <button className={`tab ${subTab === 'history' ? 'active' : ''}`} onClick={() => setSubTab('history')}>🕘 ההצעות שלי</button>
        </div>
      </div>

      {subTab === 'new' && (
        <OrderCartTab key={duplicateKey} token={token} materials={materials} products={products} users={[]}
          isAdmin={false} title='📋 מחשבון הצעת מחיר' initialItems={duplicateItems} editOrderId={editOrderId} />
      )}

      {subTab === 'history' && (
        <div className='card'>
          <h3>🕘 ההצעות שלי ({myOrders.length})</h3>
          <div className='table-wrap'>
            <table className='table'>
              <thead><tr><th>מספר</th><th>סה"כ</th><th>תאריך</th><th>פעולות</th></tr></thead>
              <tbody>
                {myOrders.map(o => (
                  <tr key={o.id}>
                    <td>#{o.id}</td>
                    <td className='price'>₪{o.total_price.toFixed(2)}</td>
                    <td>{new Date(o.created_at).toLocaleDateString('he-IL')}</td>
                    <td>
                      <button className='btn btn-sm btn-edit' title='צפה' onClick={() => viewOrder(o)}>👁️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewingOrder && (
        <OrderViewModal order={viewingOrder} token={token} isAdmin={false} onClose={() => setViewingOrder(null)}
          onDuplicate={(items) => { setDuplicateItems(items); setEditOrderId(null); setDuplicateKey(k => k + 1); setViewingOrder(null); setSubTab('new'); }}
          onEdit={(items, id) => { setDuplicateItems(items); setEditOrderId(id); setDuplicateKey(k => k + 1); setViewingOrder(null); setSubTab('new'); }} />
      )}
    </div>
  );
}



