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
function AdminPanel({ token }) {
  const [tab, setTab] = useState("materials");
  const [materials, setMaterials] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [newMat, setNewMat] = useState({ category_id: "", name: "", price_per_sqm: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingMaterial, setEditingMaterial] = useState(null);

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
      }, token);
      setNewMat({ category_id: "", name: "", price_per_sqm: "" });
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

  const catName = (id) => categories.find(c => c.id === id)?.display_name || id;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>👑 פאנל ניהול</h2>
        <div className="tab-group">
          {[["materials","🧱 חומרים"],["users","👥 לקוחות"],["quotes","📋 הצעות"]].map(
            ([k, v]) => <button key={k} className={`tab ${tab===k?"active":""}`} onClick={()=>setTab(k)}>{v}</button>
          )}
        </div>
      </div>

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
                <tr><th>שם</th><th>טלפון</th><th>שם לחשבונית</th><th>ח.פ</th><th>אימייל</th><th>חברה</th><th>תאריך</th></tr>
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
    width_cm: "", height_cm: "", quantity: 1,
    print_material_id: "", base_material_id: "", lamination_id: ""
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiCall("/api/materials").then(setMaterials);
    apiCall("/api/categories").then(setCategories);
  }, []);

  const byCategory = (name) => materials.filter(m => m.category_name === name);

  async function calculate(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await apiCall("/api/quotes/calculate", "POST", {
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

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>👤 שלום, {userName}!</h2>
        <p className="subtitle">בנה הצעת מחיר לשלט שלך</p>
      </div>

      <div className="panel-grid">
        <div className="card">
          <h3>📐 מידות ופרטים</h3>
          <form onSubmit={calculate} className="form">
            <div className="form-row">
              <div className="form-group">
                <label>רוחב (ס"מ)</label>
                <input type="number" step="0.1" placeholder="100" value={form.width_cm}
                  onChange={e => setForm({...form, width_cm: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>גובה (ס"מ)</label>
                <input type="number" step="0.1" placeholder="70" value={form.height_cm}
                  onChange={e => setForm({...form, height_cm: e.target.value})} required />
              </div>
            </div>

            <div className="form-group">
              <label>כמות</label>
              <input type="number" min="1" value={form.quantity}
                onChange={e => setForm({...form, quantity: e.target.value})} required />
            </div>

            <div className="form-group">
              <label>🖨️ חומר הדפסה</label>
              <select value={form.print_material_id}
                onChange={e => setForm({...form, print_material_id: e.target.value})}>
                <option value="">ללא הדפסה</option>
                {byCategory("PRINT").map(m => (
                  <option key={m.id} value={m.id}>{m.name} — ₪{m.price_per_sqm}/מ"ר</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>🪵 בסיס / חומר</label>
              <select value={form.base_material_id}
                onChange={e => setForm({...form, base_material_id: e.target.value})}>
                <option value="">ללא בסיס</option>
                {byCategory("BASE").map(m => (
                  <option key={m.id} value={m.id}>{m.name} — ₪{m.price_per_sqm}/מ"ר</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>✨ למינציה</label>
              <select value={form.lamination_id}
                onChange={e => setForm({...form, lamination_id: e.target.value})}>
                <option value="">ללא למינציה</option>
                {byCategory("LAMINATION").map(m => (
                  <option key={m.id} value={m.id}>{m.name} — ₪{m.price_per_sqm}/מ"ר</option>
                ))}
              </select>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? "מחשב..." : "🧮 חשב הצעת מחיר"}
            </button>
          </form>
        </div>

        {result && (
          <div className="card result-card">
            <h3>💰 הצעת המחיר שלך</h3>
            <div className="result-meta">
              <span>📏 {form.width_cm} × {form.height_cm} ס"מ</span>
              <span>📐 {result.sqm.toFixed(3)} מ"ר</span>
              <span>📦 כמות: {result.quantity}</span>
            </div>

            <div className="breakdown">
              {result.print.price > 0 && (
                <div className="breakdown-row">
                  <span>🖨️ {result.print.name}</span>
                  <span>₪{result.print.price.toFixed(2)}</span>
                </div>
              )}
              {result.base.price > 0 && (
                <div className="breakdown-row">
                  <span>🪵 {result.base.name}</span>
                  <span>₪{result.base.price.toFixed(2)}</span>
                </div>
              )}
              {result.lamination.price > 0 && (
                <div className="breakdown-row">
                  <span>✨ {result.lamination.name}</span>
                  <span>₪{result.lamination.price.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="total-row">
              <span>סה"כ לתשלום</span>
              <span className="total-price">₪{result.total.toFixed(2)}</span>
            </div>

            <p className="result-note">* המחיר אינו כולל מע"מ</p>
            <button className="btn btn-outline btn-full" onClick={() => window.print()}>
              🖨️ הדפס הצעה
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
