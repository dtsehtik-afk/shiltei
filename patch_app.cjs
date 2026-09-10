const fs = require('fs');
let content = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Inject EditUserModal and ProductsAdminTab before AdminPanel
const productsAdmin = fs.readFileSync('products_admin.jsx', 'utf8');
const editUserModal = `// ─── Edit User Modal ────────────────────────────────────────────────────────
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
}`;

const adminIndex = content.indexOf('function AdminPanel({ token }) {');
content = content.substring(0, adminIndex) + editUserModal + '\n\n' + productsAdmin + '\n\n' + content.substring(adminIndex);

// 2. Add max_width/length to EditMaterialModal
content = content.replace(
  'min_sqm: material.min_sqm || 0.1,',
  'min_sqm: material.min_sqm || 0.1,\n    max_width: material.max_width || 0,\n    max_length: material.max_length || 0,'
);
content = content.replace(
  'min_sqm: parseFloat(form.min_sqm),',
  'min_sqm: parseFloat(form.min_sqm),\n        max_width: parseFloat(form.max_width),\n        max_length: parseFloat(form.max_length),'
);
content = content.replace(
  '{error && <div className="alert alert-error">{error}</div>}',
  `<div className="form-row">
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
          {error && <div className="alert alert-error">{error}</div>}`
);

// 3. Admin Panel states and methods
content = content.replace(
  'const [newMat, setNewMat] = useState({ category_id: "", name: "", price_per_sqm: "" });',
  'const [newMat, setNewMat] = useState({ category_id: "", name: "", price_per_sqm: "", max_width: "", max_length: "" });'
);
content = content.replace(
  'const [editingMaterial, setEditingMaterial] = useState(null);',
  'const [editingMaterial, setEditingMaterial] = useState(null);\n  const [editingUser, setEditingUser] = useState(null);'
);
content = content.replace(
  'price_per_sqm: parseFloat(newMat.price_per_sqm),',
  'price_per_sqm: parseFloat(newMat.price_per_sqm),\n        max_width: newMat.max_width ? parseFloat(newMat.max_width) : 0,\n        max_length: newMat.max_length ? parseFloat(newMat.max_length) : 0,'
);
content = content.replace(
  'setNewMat({ category_id: "", name: "", price_per_sqm: "" });',
  'setNewMat({ category_id: "", name: "", price_per_sqm: "", max_width: "", max_length: "" });'
);
content = content.replace(
  'const catName = (id) => categories.find(c => c.id === id)?.display_name || id;',
  `async function saveUser(id, updates) {
    await apiCall(\`/api/admin/users/\${id}\`, "PUT", updates, token);
    setEditingUser(null);
    setMsg("✅ לקוח עודכן בהצלחה!");
    loadUsers();
    setTimeout(() => setMsg(""), 3000);
  }

  const catName = (id) => categories.find(c => c.id === id)?.display_name || id;`
);

// 4. Admin Panel Tabs & Layouts
content = content.replace(
  '[["materials","🧱 חומרים"],["users","👥 לקוחות"],["quotes","📋 הצעות"]]',
  '[["materials","🧱 חומרים"],["products","🛍️ מוצרים"],["users","👥 לקוחות"],["quotes","📋 הצעות"]]'
);

content = content.replace(
  '{tab === "materials" && (',
  '{tab === "products" && <ProductsAdminTab token={token} materials={materials} />}\n\n      {tab === "materials" && ('
);

content = content.replace(
  '<button type="submit" className="btn btn-primary" disabled={loading}>\n                {loading ? "..." : "הוסף"}\n              </button>',
  `<div className="form-group">
                <label>רוחב מקס' (ס"מ)</label>
                <input type="number" step="0.1" placeholder="ללא הגבלה" value={newMat.max_width}
                  onChange={e => setNewMat({...newMat, max_width: e.target.value})} />
              </div>
              <div className="form-group">
                <label>אורך מקס' (ס"מ)</label>
                <input type="number" step="0.1" placeholder="ללא הגבלה" value={newMat.max_length}
                  onChange={e => setNewMat({...newMat, max_length: e.target.value})} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "..." : "הוסף"}
              </button>`
);

content = content.replace(
  '<th>שם</th><th>טלפון</th><th>שם לחשבונית</th><th>ח.פ</th><th>אימייל</th><th>חברה</th><th>תאריך</th>',
  '<th>שם</th><th>טלפון</th><th>שם לחשבונית</th><th>ח.פ</th><th>אימייל</th><th>הנחה (%)</th><th>תאריך</th><th>פעולות</th>'
);

content = content.replace(
  '<td>{u.company_name || "—"}</td>\n                    <td>{new Date(u.created_at).toLocaleDateString("he-IL")}</td>\n                  </tr>',
  `<td>{u.discount_percent || 0}%</td>
                    <td>{new Date(u.created_at).toLocaleDateString("he-IL")}</td>
                    <td>
                        <button className="btn btn-sm btn-edit" onClick={() => setEditingUser(u)} title="עריכה">
                          ✏️
                        </button>
                    </td>
                  </tr>`
);

content = content.replace(
  '</div>\n        </div>\n      )}',
  `</div>
          {editingUser && (
            <EditUserModal
              user={editingUser}
              onSave={saveUser}
              onClose={() => setEditingUser(null)}
            />
          )}
        </div>
      )}`
);

// 5. Replace UserPanel
let userPanelNew = fs.readFileSync('userpanel.jsx', 'utf8');

// The original userpanel.jsx I wrote had some backtick strings broken by PS Write-Output.
// PS output them like \`%"ר instead of the correct syntax. Let me just carefully re-inject UserPanel as a raw string directly.
// Actually, `userpanel.jsx` is almost correct, we just need to fix some literal characters:
userPanelNew = userPanelNew.replace(/width: \\\\%\\\\,/g, 'width: `${(1 / result.layout.columns) * 100}%`,');
userPanelNew = userPanelNew.replace(/height: \\\\%\\\\,/g, 'height: `${(1 / result.layout.rows) * 100}%`,');
userPanelNew = userPanelNew.replace(/מ\`"ר/g, 'מ"ר');
userPanelNew = userPanelNew.replace(/ס\`"מ/g, 'ס"מ');
userPanelNew = userPanelNew.replace(/סה\`"כ/g, 'סה"כ');
userPanelNew = userPanelNew.replace(/מ\`/g, "מ'");
userPanelNew = userPanelNew.replace(/יח\`/g, "יח'");

const uStart = content.indexOf('function UserPanel({ token, userName }) {');
if (uStart !== -1) {
  content = content.substring(0, uStart) + userPanelNew;
}

fs.writeFileSync('src/App.jsx', content);
console.log('App.jsx patched successfully');
