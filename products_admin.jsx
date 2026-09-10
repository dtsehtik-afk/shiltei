
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
    await apiCall(\/api/admin/products/\\, 'DELETE', null, token);
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

