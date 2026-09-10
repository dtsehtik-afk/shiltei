
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
                         width: \\%\,
                         borderBottom: Math.floor(i / result.layout.columns) < result.layout.rows - 1 ? '1px solid #1a2a44' : 'none',
                         height: \\%\,
                         boxSizing: 'border-box', float: 'right'
                      }}>
                         שלום
                      </div>
                   ))}
                   <div className='layout-roll-label'>רוחב גליל: {result.layout.roll_width_m} מ</div>
                   <div className='layout-length-label'>אורך נדרש: {result.layout.required_length_m} מ</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

