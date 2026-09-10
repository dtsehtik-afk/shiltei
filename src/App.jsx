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
        <p>🛑 שלטי הצפון © {new Date().getFullYear()} | כל הזכויות שמורות</p>
      </footer>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ role, userName, onLogout, screen, setScreen }) {
  return (
    <header className="header">
      <div className="header-brand">
        <span className="brand-icon">🛑</span>
        <div>
          <h1 className="brand-title">שלטי הצפון</h1>
          <p className="brand-sub">מערכת תמחור מתקדמת</p>
        </div>
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
            <div className="form-row">
            <div className="form-group">
              <label>רוחב מקס' (ס"מ)</label>
              <input type="number" step="0.1" value={form.max_width}
                onChange={e => setForm({...form, max_width: e.target.value})} />
            </div>
            <div className="form-group">
              <label>אורך מקס' (ס"מ)</label>
              <input type="number" step="0.1" value={form.max_length}
                onChange={e => setForm({...form, max_length: e.target.value})} />
            </div>
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
    max_width: material.max_width || 0,
    max_length: material.max_length || 0,
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
        min_sqm: parseFloat(form.min_sqm),
        max_width: parseFloat(form.max_width),
        max_length: parseFloat(form.max_length),
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
              <label>מחיר ל-SQM (₪)</label>
              <input type="number" step="0.01" value={form.price_per_sqm}
                onChange={e => setForm({...form, price_per_sqm: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>מינימום מ"ר</label>
              <input type="number" step="0.01" value={form.min_sqm}
                onChange={e => setForm({...form, min_sqm: e.target.value})} required />
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



function AdminPanel({ token }) {
  const [tab, setTab] = useState("materials");
  const [materials, setMaterials] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [newMat, setNewMat] = useState({ category_id: "", name: "", price_per_sqm: "", max_width: "", max_length: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  useEffect(() => { loadMaterials(); loadCategories(); }, []);
  useEffect(() => {
    if (tab === "users") loadUsers();
    if (tab === "quotes") loadQuotes();
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
  async function loadQuotes() {
    const data = await apiCall("/api/admin/quotes", "GET", null, token);
    setQuotes(data);
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

  const catName = (id) => categories.find(c => c.id === id)?.display_name || id;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>👑 פאנל ניהול</h2>
        <div className="tab-group">
          {[["materials","🧱 חומרים"],["products","🛍️ מוצרים"],["users","👥 לקוחות"],["quotes","📋 הצעות"]].map(
            ([k, v]) => <button key={k} className={`tab ${tab===k?"active":""}`} onClick={()=>setTab(k)}>{v}</button>
          )}
        </div>
      </div>

      {tab === "products" && <ProductsAdminTab token={token} materials={materials} />}

      {tab === "materials" && (
        <div>
          <div className="card">
            <h3>➕ הוסף חומר חדש</h3>
            <form onSubmit={addMaterial} className="form form-inline">
              <div className="form-group">
                <label>קטגוריה</label>
                <select value={newMat.category_id} onChange={e => setNewMat({...newMat, category_id: e.target.value})} required>
                  <option value="">בחר קטגוריה</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>שם החומר</label>
                <input type="text" placeholder="ויניל גלוס..." value={newMat.name}
                  onChange={e => setNewMat({...newMat, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>מחיר ל-SQM (₪)</label>
                <input type="number" step="0.01" placeholder="35.00" value={newMat.price_per_sqm}
                  onChange={e => setNewMat({...newMat, price_per_sqm: e.target.value})} required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "..." : "הוסף"}
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
          <h3>👥 לקוחות רשומים ({users.length})</h3>
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
                    <td>{u.company_name || "—"}</td>
                    <td>{new Date(u.created_at).toLocaleDateString("he-IL")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "quotes" && (
        <div className="card">
          <h3>📋 הצעות מחיר ({quotes.length})</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>לקוח</th><th>מידות (ס"מ)</th><th>מ"ר</th><th>כמות</th><th>סה"כ</th><th>תאריך</th></tr>
              </thead>
              <tbody>
                {quotes.map(q => (
                  <tr key={q.id}>
                    <td>{q.user_name || "אנונימי"}</td>
                    <td>{q.width_cm} × {q.height_cm}</td>
                    <td>{q.sqm.toFixed(3)}</td>
                    <td>{q.quantity}</td>
                    <td className="price">₪{q.total_price.toFixed(2)}</td>
                    <td>{new Date(q.created_at).toLocaleDateString("he-IL")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── User Panel ───────────────────────────────────────────────────────────────

function UserPanel({ token, userName }) {
  const [materials, setMaterials] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    width_cm: '', height_cm: '', quantity: 1,
    print_material_id: '', base_material_id: '', lamination_id: ''
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall('/api/materials').then(setMaterials);
    apiCall('/api/categories').then(setCategories);
  }, []);

  const byCategory = (name) => materials.filter(m => m.category_name === name);

  async function calculate(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await apiCall('/api/quotes/calculate', 'POST', {
        width_cm: parseFloat(form.width_cm),
        height_cm: parseFloat(form.height_cm),
        quantity: parseInt(form.quantity),
        print_material_id: form.print_material_id ? parseInt(form.print_material_id) : null,
        base_material_id: form.base_material_id ? parseInt(form.base_material_id) : null,
        lamination_id: form.lamination_id ? parseInt(form.lamination_id) : null,
      }, token);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const quoteNumber = Math.floor(Math.random() * 900) + 100;
  const today = new Date().toLocaleDateString('he-IL');

  return (
    <div className='panel'>
      <div className='panel-header'>
        <h2>שלום, {userName}!</h2>
        <p className='subtitle'>בחר חומרים לקבלת הצעת מחיר</p>
      </div>

      <div className='panel-grid'>
        <div className='card'>
          <h3>📋 מחשבון הצעת מחיר</h3>
          <form onSubmit={calculate} className='form'>
            <div className='form-row'>
              <div className='form-group'>
                <label>רוחב (ס"מ)</label>
                <input type='number' step='0.1' placeholder='100' value={form.width_cm}
                  onChange={e => setForm({...form, width_cm: e.target.value})} required />
              </div>
              <div className='form-group'>
                <label>גובה (ס"מ)</label>
                <input type='number' step='0.1' placeholder='70' value={form.height_cm}
                  onChange={e => setForm({...form, height_cm: e.target.value})} required />
              </div>
            </div>

            <div className='form-group'>
              <label>כמות</label>
              <input type='number' min='1' value={form.quantity}
                onChange={e => setForm({...form, quantity: e.target.value})} required />
            </div>

            <div className='form-group'>
              <label>🖨️ חומר הדפסה</label>
              <select value={form.print_material_id}
                onChange={e => setForm({...form, print_material_id: e.target.value})}>
                <option value=''>ללא הדפסה</option>
                {byCategory('PRINT').map(m => (
                  <option key={m.id} value={m.id}>{m.name} - ₪{m.price_per_sqm}/מ"ר</option>
                ))}
              </select>
            </div>

            <div className='form-group'>
              <label>🧱 חומר רקע / שלט</label>
              <select value={form.base_material_id}
                onChange={e => setForm({...form, base_material_id: e.target.value})}>
                <option value=''>ללא רקע</option>
                {byCategory('BASE').map(m => (
                  <option key={m.id} value={m.id}>{m.name} - ₪{m.price_per_sqm}/מ"ר</option>
                ))}
              </select>
            </div>

            <div className='form-group'>
              <label>✨ למינציה</label>
              <select value={form.lamination_id}
                onChange={e => setForm({...form, lamination_id: e.target.value})}>
                <option value=''>ללא למינציה</option>
                {byCategory('LAMINATION').map(m => (
                  <option key={m.id} value={m.id}>{m.name} - ₪{m.price_per_sqm}/מ"ר</option>
                ))}
              </select>
            </div>

            {error && <div className='alert alert-error'>{error}</div>}

            <button type='submit' className='btn btn-primary btn-full' disabled={loading}>
              {loading ? 'מחשב...' : '🧮 חשב הצעת מחיר'}
            </button>
          </form>
        </div>

        {result && (
          <div className='card result-card'>
            <div className='quote-header'>
              <div>
                <h1 className='quote-title'>הצעת מחיר</h1>
                <div className='quote-info'>מספר הצעה: #{quoteNumber}</div>
                <div className='quote-info'>תאריך: {today}</div>
              </div>
              <div className='quote-logo'>
                <svg viewBox='0 0 100 50' fill='none' xmlns='http://www.w3.org/2000/svg' style={{height:'40px'}}>
                  <path d='M10,25 C10,15 25,10 40,25 C25,40 10,35 10,25 Z' fill='#29B6F6'/>
                  <path d='M30,25 C30,15 45,10 60,25 C45,40 30,35 30,25 Z' fill='#AB47BC'/>
                  <path d='M50,25 C50,15 65,10 80,25 C65,40 50,35 50,25 Z' fill='#FFA726'/>
                </svg>
                <div style={{display: 'flex', flexDirection: 'column'}}>
                   <span style={{fontSize: '24px', fontWeight: 'bold', color: '#64B5F6', lineHeight: 1}}>שלטי</span>
                   <span style={{fontSize: '24px', fontWeight: 'bold', color: '#fff', lineHeight: 1}}>הצפון</span>
                </div>
              </div>
            </div>

            <div className='quote-customer'>לכבוד: {userName}</div>

            <table className='quote-table'>
              <thead>
                <tr>
                  <th>פריט</th>
                  <th>מידות (מ)</th>
                  <th>כמות</th>
                  <th>מחיר ליחידה</th>
                  <th>סה"כ</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>הדפסה: {result.print?.name || '-'} <br/> גימור: {result.lamination?.name || '-'} <br/> רקע: {result.base?.name || '-'}</td>
                  <td dir='ltr'>{form.width_cm / 100} × {form.height_cm / 100}</td>
                  <td>{result.quantity}</td>
                  <td>₪{(result.subtotal / result.quantity).toFixed(2)}</td>
                  <td>₪{result.subtotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            {result.warnings && result.warnings.length > 0 && (
              <div className='quote-warnings'>
                {result.warnings.map((w, i) => <div key={i} className='quote-warning-item'>⚠️ {w}</div>)}
              </div>
            )}

            <div className='quote-summary'>
              {result.discount_amount > 0 && (
                <>
                  <div className='quote-summary-row'>
                    <span>לפני הנחה:</span>
                    <span>₪{result.subtotal.toFixed(2)}</span>
                  </div>
                  <div className='quote-summary-row'>
                    <span>הנחה ({result.discount_percent}%):</span>
                    <span style={{color: 'red'}}>-₪{result.discount_amount.toFixed(2)}</span>
                  </div>
                  <div className='quote-summary-row'>
                    <span>סה"כ לאחר הנחה:</span>
                    <span>₪{result.total_after_discount.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className='quote-summary-row'>
                <span>מע"מ (17%):</span>
                <span>₪{result.vat_amount.toFixed(2)}</span>
              </div>
              <div className='quote-summary-row' style={{marginTop: '10px'}}>
                <div className='quote-total-box'>
                  סה"כ לתשלום: {result.total.toFixed(2)} ₪
                </div>
              </div>
            </div>
            
            <p className='result-note' style={{marginTop: '40px', fontSize: '0.8rem', textAlign: 'center'}}>
              הצעת המחיר בתוקף ל-14 יום ממועד ההפקה<br/>תודה שבחרתם בשלטי הצפון
            </p>

            <div style={{marginTop: '20px', textAlign: 'center'}}>
              <button className='btn btn-outline' onClick={() => window.print()}>
                🖨️ הדפס הצעת מחיר
              </button>
            </div>

            {result.layout && (
              <div className='layout-page print-page-break'>
                <div className='quote-header' style={{marginBottom: '10px'}}>
                   <h1 className='quote-title'>גיליון פריסה</h1>
                </div>
                <h3 className='layout-title'>פריסה עבור: {result.print?.name}</h3>
                <div className='layout-meta'>
                  מידות פריט: {form.width_cm/100}×{form.height_cm/100} מ · כמות: {result.quantity} יח · רוחב גליל: {result.layout.roll_width_m} מ<br/>
                  סידור: {result.layout.columns} טורים × {result.layout.rows} שורות · אורך גליל נדרש: {result.layout.required_length_m} מ · בזבוז משוער: {result.layout.waste_percent}%
                </div>
                
                <div className='layout-visual'>
                   {Array.from({length: Math.min(result.layout.columns * result.layout.rows, result.quantity)}).map((_, i) => (
                      <div key={i} className='layout-item-box' style={{
                         width: `${(1 / result.layout.columns) * 100}%`,
                         borderBottom: Math.floor(i / result.layout.columns) < result.layout.rows - 1 ? '1px solid #1a2a44' : 'none',
                         height: `${(1 / result.layout.rows) * 100}%`,
                         boxSizing: 'border-box', float: 'right'
                      }}>
                         שלום
                      </div>
                   ))}
                   <div className='layout-roll-label'>רוחב גליל: {result.layout.roll_width_m} מ'</div>
                   <div className='layout-length-label'>אורך נדרש: {result.layout.required_length_m} מ'</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

