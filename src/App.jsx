import { useState, useEffect } from "react";
import "./App.css";

const API = "http://localhost:8000";

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
  const [screen, setScreen] = useState("login"); // login | register | admin | user

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
        {screen === "login" && <LoginScreen onLogin={onLogin} setScreen={setScreen} />}
        {screen === "register" && <RegisterScreen setScreen={setScreen} />}
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

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, setScreen }) {
  const [tab, setTab] = useState("user"); // user | admin
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      let data;
      if (tab === "admin") {
        data = await apiCall("/api/auth/admin/login", "POST", {
          username: form.username,
          password: form.password,
        });
        onLogin(data.access_token, "admin");
      } else {
        data = await apiCall("/api/auth/login", "POST", {
          email: form.email,
          password: form.password,
        });
        onLogin(data.access_token, "user", data.name);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="card auth-card">
        <div className="card-icon">🔐</div>
        <h2>כניסה למערכת</h2>

        <div className="tab-group">
          <button className={`tab ${tab === "user" ? "active" : ""}`} onClick={() => setTab("user")}>
            👤 לקוח
          </button>
          <button className={`tab ${tab === "admin" ? "active" : ""}`} onClick={() => setTab("admin")}>
            👑 מנהל
          </button>
        </div>

        <form onSubmit={handleLogin} className="form">
          {tab === "admin" ? (
            <div className="form-group">
              <label>שם משתמש</label>
              <input
                type="text"
                placeholder="admin"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
          ) : (
            <div className="form-group">
              <label>אימייל</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>סיסמה</label>
            <input
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? "מתחבר..." : "כניסה"}
          </button>
        </form>

        {tab === "user" && (
          <p className="auth-link">
            עדיין אין לך חשבון?{" "}
            <button className="link-btn" onClick={() => setScreen("register")}>
              הרשמה
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Register Screen ──────────────────────────────────────────────────────────
function RegisterScreen({ setScreen }) {
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    company_name: "", address: "", password: "", confirm: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleRegister(e) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("הסיסמאות אינן תואמות");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiCall("/api/users/register", "POST", {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        company_name: form.company_name,
        address: form.address,
        password: form.password,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="auth-container">
        <div className="card auth-card text-center">
          <div className="card-icon">🎉</div>
          <h2>נרשמת בהצלחה!</h2>
          <p>ברוך הבא למשפחת שלטי הצפון</p>
          <button className="btn btn-primary" onClick={() => setScreen("login")}>
            כניסה למערכת
          </button>
        </div>
      </div>
    );
  }

  const field = (key, label, type = "text", placeholder = "") => (
    <div className="form-group">
      <label>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="auth-container">
      <div className="card auth-card wide">
        <div className="card-icon">📝</div>
        <h2>הרשמה למערכת</h2>
        <form onSubmit={handleRegister} className="form">
          <div className="form-row">
            {field("first_name", "שם פרטי *", "text", "ישראל")}
            {field("last_name", "שם משפחה *", "text", "ישראלי")}
          </div>
          <div className="form-row">
            {field("email", "אימייל *", "email", "israel@company.co.il")}
            {field("phone", "טלפון", "tel", "050-0000000")}
          </div>
          {field("company_name", "שם חברה", "text", "חברה בע\"מ")}
          {field("address", "כתובת", "text", "רחוב הדוגמה 1, תל אביב")}
          <div className="form-row">
            {field("password", "סיסמה *", "password", "••••••••")}
            {field("confirm", "אימות סיסמה *", "password", "••••••••")}
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? "נרשם..." : "הרשמה"}
          </button>
        </form>
        <p className="auth-link">
          כבר יש לך חשבון?{" "}
          <button className="link-btn" onClick={() => setScreen("login")}>כניסה</button>
        </p>
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
        </div>
      )}

      {tab === "users" && (
        <div className="card">
          <h3>👥 לקוחות רשומים ({users.length})</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>שם</th><th>אימייל</th><th>טלפון</th><th>חברה</th><th>תאריך</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.first_name} {u.last_name}</td>
                    <td>{u.email}</td>
                    <td>{u.phone}</td>
                    <td>{u.company_name}</td>
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
