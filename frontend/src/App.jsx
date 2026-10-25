import { useEffect, useState } from 'react'
import { api, openPdf, wa, today, inr, digits } from './api'
import './style.css'

function useLoad(path) {
  const [data, setData] = useState(null)
  const load = () => (path ? api(path).then(setData).catch(() => setData([])) : null)
  useEffect(() => { setData(null); load() }, [path])
  return [data, load]
}
const Err = ({ e }) => (e ? <p className="err full">{e}</p> : null)
const initials = (n) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

function Login({ onIn }) {
  const [u, setU] = useState('teacher'), [p, setP] = useState(''), [err, setErr] = useState('')
  const go = async (e) => {
    e.preventDefault()
    try {
      const r = await api('/login/', { method: 'POST', body: { username: u.trim(), password: p } })
      localStorage.setItem('token', r.token); onIn()
    } catch { setErr('Wrong username or password') }
  }
  return (
    <form className="login card" onSubmit={go}>
      <h1>Smart Tuition Manager</h1>
      <label>Username<input required value={u} onChange={(e) => setU(e.target.value)} /></label>
      <label>Password<input required type="password" value={p} onChange={(e) => setP(e.target.value)} /></label>
      <Err e={err} />
      <button className="btn">Sign in</button>
    </form>
  )
}

function Dashboard({ go }) {
  const [d] = useLoad('/dashboard/')
  if (!d) return <p className="muted">Loading…</p>
  const pct = d.total_billed > 0 ? Math.min(100, Math.round((d.total_paid / d.total_billed) * 100)) : 0
  return (
    <>
      <p className="muted">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <section className="hero">
        <div className="herotop">
          <div><span>Fees collected so far</span><b>{inr(d.total_paid)}</b><span>out of {inr(d.total_billed)} billed</span></div>
          <div className="facts"><b>{d.students}</b> students<br /><b>{d.batches}</b> batches</div>
        </div>
        <div className="meter"><i style={{ width: pct + '%' }} /></div>
        <div className="herofoot"><span>{pct}% collected</span><span>{inr(d.collected_this_month)} received this month</span><span className="pend">{inr(d.total_due)} pending</span></div>
      </section>
      <div className="cols">
        <section>
          <h3>Today's classes</h3>
          {d.batches_today.length === 0 && <p className="muted">No batches yet. Create one in Batches.</p>}
          {d.batches_today.map((b) => (
            <div className="row" key={b.id}>
              <div><b>{b.name}</b><div className="muted">{b.timing || 'No timing set'}, {b.students} students</div></div>
              {b.marked
                ? <span className="pill ok">{b.present} present, {b.absent} absent</span>
                : <button className="btn small" onClick={() => go('Attendance')}>Mark attendance</button>}
            </div>
          ))}
        </section>
        <section>
          <h3>Pending fees</h3>
          {d.top_dues.length === 0 && <p className="muted">No pending fees. Everyone is clear.</p>}
          {d.top_dues.map((s) => (
            <div className="row" key={s.id}>
              <span className="av">{initials(s.name)}</span>
              <div className="grow"><b>{s.name}</b><div className="bad">{inr(s.due)}</div></div>
              <a className="btn small ghost" target="_blank" rel="noreferrer" href={wa(s.parent_phone, `Fee of ${inr(s.due)} is pending for ${s.name}. Kindly pay at the earliest. Thank you.`)}>Remind</a>
            </div>
          ))}
        </section>
      </div>
      <section>
        <h3>Recent payments</h3>
        {d.recent_payments.length === 0 && <p className="muted">No payments recorded yet.</p>}
        {d.recent_payments.map((p) => (
          <div className="row" key={p.id}>
            <div className="grow"><b>{p.student_name}</b><div className="muted">{p.receipt_no}, {p.paid_on}</div></div>
            <b className="ok">{inr(p.amount)}</b>
            <button className="btn small ghost" onClick={() => openPdf(`/payments/${p.id}/receipt/`)}>Receipt</button>
          </div>
        ))}
      </section>
    </>
  )
}

const blankStudent = () => ({ name: '', phone: '', parent_name: '', parent_phone: '', address: '', joined_on: today(), batches: [] })

function Students() {
  const [list, load] = useLoad('/students/')
  const [batches] = useLoad('/batches/')
  const [f, setF] = useState(blankStudent()), [q, setQ] = useState(''), [rep, setRep] = useState(null), [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const setPhone = (k) => (e) => setF({ ...f, [k]: digits(e.target.value) })
  const toggle = (id) => setF({ ...f, batches: f.batches.includes(id) ? f.batches.filter((x) => x !== id) : [...f.batches, id] })
  const save = async (e) => {
    e.preventDefault(); setErr('')
    if (f.batches.length === 0) return setErr('Select at least one batch')
    try { await api('/students/', { method: 'POST', body: f }); setF(blankStudent()); load() } catch (x) { setErr(x.message) }
  }
  const remove = async (s) => { if (confirm(`Delete ${s.name}? Attendance, marks and payments will be deleted too.`)) { await api(`/students/${s.id}/`, { method: 'DELETE' }); load() } }
  const shown = (list || []).filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
  const ph = { pattern: '[6-9][0-9]{9}', inputMode: 'numeric', maxLength: 10, title: '10-digit mobile number starting with 6-9' }
  return (
    <>
      <form className="card grid" onSubmit={save}>
        <h3>Register student</h3>
        <label>Student name*<input required minLength={2} maxLength={100} value={f.name} onChange={set('name')} /></label>
        <label>Student phone<input {...ph} value={f.phone} onChange={setPhone('phone')} /></label>
        <label>Parent name*<input required minLength={2} maxLength={100} value={f.parent_name} onChange={set('parent_name')} /></label>
        <label>Parent phone (WhatsApp)*<input required {...ph} value={f.parent_phone} onChange={setPhone('parent_phone')} /></label>
        <label>Address<input maxLength={255} value={f.address} onChange={set('address')} /></label>
        <label>Joining date*<input required type="date" max={today()} value={f.joined_on} onChange={set('joined_on')} /></label>
        <div className="full"><span className="lbl">Batches*</span>
          {(batches || []).map((b) => (
            <label key={b.id} className="chip"><input type="checkbox" checked={f.batches.includes(b.id)} onChange={() => toggle(b.id)} /> {b.name}</label>
          ))}
          {batches && batches.length === 0 && <span className="muted"> Create a batch first.</span>}
        </div>
        <Err e={err} />
        <button className="btn">Add student</button>
      </form>
      <input className="search" placeholder="Search student…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="scroll"><table>
        <thead><tr><th>Name</th><th>Batches</th><th>Parent</th><th className="num">Due</th><th></th></tr></thead>
        <tbody>{shown.map((s) => (
          <tr key={s.id}><td>{s.name}</td><td>{s.batch_names.join(', ')}</td><td>{s.parent_name} {s.parent_phone}</td>
            <td className={'num ' + (s.due > 0 ? 'bad' : '')}>{inr(s.due)}</td>
            <td><button className="btn small" onClick={async () => setRep(await api(`/students/${s.id}/report/`))}>Report</button> <button className="btn small ghost" onClick={() => remove(s)}>Delete</button></td></tr>
        ))}</tbody>
      </table></div>
      {rep && <Report rep={rep} close={() => setRep(null)} />}
    </>
  )
}

function Report({ rep, close }) {
  const { student: s, attendance: a, marks } = rep
  const text = `Progress report of ${s.name}: Attendance ${a.percent ?? '-'}% (${a.present}/${a.total}). ` +
    (marks.length ? 'Tests: ' + marks.slice(0, 5).map((m) => `${m.test} ${m.marks}/${m.max}`).join(', ') + '. ' : '') + `Fee due: ${inr(s.due)}.`
  return (
    <div className="modal" onClick={close}><div className="card" onClick={(e) => e.stopPropagation()}>
      <h3>{s.name}</h3>
      <p>Attendance: <b>{a.percent ?? '-'}%</b> ({a.present} of {a.total} classes)</p>
      <p>Fees: total {inr(s.total_fee)}, paid {inr(s.paid)}, <b className={s.due > 0 ? 'bad' : ''}>due {inr(s.due)}</b></p>
      <table><thead><tr><th>Test</th><th>Date</th><th className="num">Marks</th><th className="num">%</th></tr></thead>
        <tbody>{marks.map((m, i) => <tr key={i}><td>{m.test}</td><td>{m.date}</td><td className="num">{m.marks}/{m.max}</td><td className="num">{m.percent}%</td></tr>)}</tbody></table>
      {marks.length === 0 && <p className="muted">No test marks yet.</p>}
      <p><a className="btn" target="_blank" rel="noreferrer" href={wa(s.parent_phone, text)}>Send report to parent</a> <button className="btn ghost" onClick={close}>Close</button></p>
    </div></div>
  )
}

const blankBatch = { name: '', subject: '', timing: '', monthly_fee: '' }
function Batches() {
  const [list, load] = useLoad('/batches/')
  const [f, setF] = useState(blankBatch), [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => { e.preventDefault(); setErr(''); try { await api('/batches/', { method: 'POST', body: f }); setF(blankBatch); load() } catch (x) { setErr(x.message) } }
  const remove = async (b) => { if (confirm(`Delete batch ${b.name}?`)) { await api(`/batches/${b.id}/`, { method: 'DELETE' }); load() } }
  return (
    <>
      <form className="card grid" onSubmit={save}>
        <h3>New batch</h3>
        <label>Batch name*<input required minLength={2} maxLength={100} value={f.name} onChange={set('name')} /></label>
        <label>Subject<input maxLength={100} value={f.subject} onChange={set('subject')} /></label>
        <label>Timing<input maxLength={100} placeholder="e.g. 5-6 PM" value={f.timing} onChange={set('timing')} /></label>
        <label>Monthly fee (₹)*<input required type="number" min="1" max="100000" step="1" value={f.monthly_fee} onChange={set('monthly_fee')} /></label>
        <Err e={err} />
        <button className="btn">Add batch</button>
      </form>
      <table><thead><tr><th>Batch</th><th>Timing</th><th className="num">Fee / month</th><th className="num">Students</th><th></th></tr></thead>
        <tbody>{(list || []).map((b) => (
          <tr key={b.id}><td>{b.name} <span className="muted">{b.subject}</span></td><td>{b.timing}</td><td className="num">{inr(b.monthly_fee)}</td><td className="num">{b.student_count}</td>
            <td><button className="btn small ghost" onClick={() => remove(b)}>Delete</button></td></tr>
        ))}</tbody></table>
    </>
  )
}

function Attendance() {
  const [batches] = useLoad('/batches/')
  const [batch, setBatch] = useState(''), [date, setDate] = useState(today()), [msg, setMsg] = useState(''), [err, setErr] = useState('')
  const [rows, setRows] = useState([])
  useEffect(() => {
    setMsg(''); setErr('')
    if (batch && date) api(`/attendance/?batch=${batch}&date=${date}`).then(setRows).catch((x) => { setRows([]); setErr(x.message) })
    else setRows([])
  }, [batch, date])
  const flip = (id) => { setMsg(''); setRows(rows.map((r) => (r.student === id ? { ...r, present: !r.present } : r))) }
  const save = async () => {
    setErr('')
    try { setRows(await api('/attendance/', { method: 'POST', body: { batch, date, records: rows.map((x) => ({ student: x.student, present: x.present })) } })); setMsg('Attendance saved') }
    catch (x) { setErr(x.message) }
  }
  const absent = rows.filter((r) => !r.present)
  return (
    <>
      <div className="bar">
        <select value={batch} onChange={(e) => setBatch(e.target.value)}>
          <option value="">Select batch</option>
          {(batches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        {rows.length > 0 && <button className="btn" onClick={() => setRows(rows.map((r) => ({ ...r, present: true })))}>Mark all present</button>}
      </div>
      <Err e={err} />
      {batch && rows.length === 0 && !err && <p className="muted">No students in this batch yet.</p>}
      {rows.map((r) => (
        <div key={r.student} className={'att ' + (r.present ? 'p' : 'a')} onClick={() => flip(r.student)}>
          <span>{r.name}</span><b>{r.present ? 'Present' : 'Absent'}</b>
        </div>
      ))}
      {rows.length > 0 && <p><button className="btn" onClick={save}>Save attendance</button> <span className="ok">{msg}</span></p>}
      {msg && absent.length > 0 && (<>
        <h3>Tell parents about absentees</h3>
        {absent.map((r) => <p key={r.student}><a className="btn small" target="_blank" rel="noreferrer" href={wa(r.parent_phone, `${r.name} was absent from class on ${date}.`)}>{r.name}: message parent</a></p>)}
      </>)}
    </>
  )
}

function Fees() {
  const [students, loadS] = useLoad('/students/')
  const [pays, loadP] = useLoad('/payments/')
  const [f, setF] = useState({ student: '', amount: '', mode: 'cash', for_month: '', paid_on: today() }), [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const cur = (students || []).find((x) => x.id == f.student)
  const pick = (e) => { const s = (students || []).find((x) => x.id == e.target.value); setF({ ...f, student: e.target.value, amount: s && s.due > 0 ? s.due : '' }) }
  const save = async (e) => {
    e.preventDefault(); setErr('')
    if (cur && Number(f.amount) > Number(cur.due)) return setErr(`Amount is more than the pending fee of ${inr(cur.due)}`)
    try {
      const p = await api('/payments/', { method: 'POST', body: f })
      setF({ ...f, student: '', amount: '' }); loadS(); loadP(); openPdf(`/payments/${p.id}/receipt/`)
    } catch (x) { setErr(x.message) }
  }
  return (
    <>
      <form className="card grid" onSubmit={save}>
        <h3>Record payment</h3>
        <label>Student*<select required value={f.student} onChange={pick}>
          <option value="">Select</option>
          {(students || []).filter((s) => s.due > 0).map((s) => <option key={s.id} value={s.id}>{s.name} (due {inr(s.due)})</option>)}
        </select></label>
        <label>Amount (₹)*<input required type="number" min="1" max={cur ? cur.due : undefined} step="0.01" value={f.amount} onChange={set('amount')} /></label>
        <label>Mode<select value={f.mode} onChange={set('mode')}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank transfer</option></select></label>
        <label>For month<input maxLength={30} placeholder="e.g. October 2026" value={f.for_month} onChange={set('for_month')} /></label>
        <label>Date*<input required type="date" max={today()} value={f.paid_on} onChange={set('paid_on')} /></label>
        <Err e={err} />
        <button className="btn">Save and print receipt</button>
      </form>
      <h3>Payment history</h3>
      <div className="scroll"><table>
        <thead><tr><th>Receipt</th><th>Date</th><th>Student</th><th className="num">Amount</th><th></th></tr></thead>
        <tbody>{(pays || []).map((p) => (
          <tr key={p.id}><td>{p.receipt_no}</td><td>{p.paid_on}</td><td>{p.student_name}</td><td className="num">{inr(p.amount)}</td>
            <td><button className="btn small" onClick={() => openPdf(`/payments/${p.id}/receipt/`)}>Receipt</button>{' '}
              <a className="btn small ghost" target="_blank" rel="noreferrer" href={wa(p.parent_phone, `Received ${inr(p.amount)} for ${p.student_name} on ${p.paid_on}. Receipt no ${p.receipt_no}. Thank you.`)}>WhatsApp</a></td></tr>
        ))}</tbody>
      </table></div>
    </>
  )
}

function Tests({ go }) {
  const [batches] = useLoad('/batches/')
  const [tests, load] = useLoad('/tests/')
  const [f, setF] = useState({ batch: '', name: '', date: today(), max_marks: 100 }), [err, setErr] = useState('')
  const [open, setOpen] = useState(null), [info, setInfo] = useState(null), [msg, setMsg] = useState(''), [merr, setMerr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const create = async (e) => { e.preventDefault(); setErr(''); try { await api('/tests/', { method: 'POST', body: f }); setF({ ...f, name: '' }); load() } catch (x) { setErr(x.message) } }
  const openMarks = async (t) => { setOpen(t); setMsg(''); setMerr(''); setInfo(await api(`/tests/${t.id}/marks/`)) }
  const setMark = (id, v) => setInfo({ ...info, rows: info.rows.map((r) => (r.student === id ? { ...r, marks: v } : r)) })
  const save = async () => {
    setMerr(''); setMsg('')
    const recs = info.rows.filter((r) => r.eligible)
    const bad = recs.find((r) => r.marks !== null && r.marks !== '' && (isNaN(r.marks) || Number(r.marks) < 0 || Number(r.marks) > Number(open.max_marks)))
    if (bad) return setMerr(`${bad.name}: marks must be between 0 and ${Number(open.max_marks)}`)
    try { setInfo(await api(`/tests/${open.id}/marks/`, { method: 'POST', body: { records: recs.map((r) => ({ student: r.student, marks: r.marks })) } })); setMsg('Marks saved') }
    catch (x) { setMerr(x.message) }
  }
  const eligible = info ? info.rows.filter((r) => r.eligible).length : 0
  return (
    <>
      <form className="card grid" onSubmit={create}>
        <h3>New test</h3>
        <label>Batch*<select required value={f.batch} onChange={set('batch')}><option value="">Select</option>{(batches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Test name*<input required minLength={2} maxLength={100} value={f.name} onChange={set('name')} /></label>
        <label>Test date*<input required type="date" value={f.date} onChange={set('date')} /></label>
        <label>Max marks*<input required type="number" min="1" max="1000" value={f.max_marks} onChange={set('max_marks')} /></label>
        <Err e={err} />
        <button className="btn">Create test</button>
      </form>
      <table><thead><tr><th>Test</th><th>Batch</th><th>Date</th><th className="num">Max</th><th></th></tr></thead>
        <tbody>{(tests || []).map((t) => (
          <tr key={t.id}><td>{t.name}</td><td>{t.batch_name}</td><td>{t.date}</td><td className="num">{Number(t.max_marks)}</td>
            <td><button className="btn small" onClick={() => openMarks(t)}>Enter marks</button></td></tr>
        ))}</tbody></table>
      {open && info && (
        <div className="card">
          <h3>{open.name} <span className="muted">out of {Number(open.max_marks)}, held on {open.date}</span></h3>
          <p className="muted">Only students who were present on {open.date} can get marks.</p>
          {!info.attendance_marked && <p className="err">Attendance was not marked for this batch on {open.date}. <button className="btn small" onClick={() => go('Attendance')}>Go to attendance</button></p>}
          {info.rows.map((r) => (
            <div key={r.student} className={'markrow' + (r.eligible ? '' : ' off')}>
              <span>{r.name}{!r.eligible && <em> ({r.reason})</em>}</span>
              <input type="number" min="0" max={Number(open.max_marks)} step="0.5" disabled={!r.eligible} value={r.marks ?? ''} onChange={(e) => setMark(r.student, e.target.value)} />
              {msg && r.marks != null && <a className="btn small ghost" target="_blank" rel="noreferrer" href={wa(r.parent_phone, `${r.name} scored ${Number(r.marks)}/${Number(open.max_marks)} in ${open.name}.`)}>Tell parent</a>}
            </div>
          ))}
          {info.rows.length === 0 && <p className="muted">No students in this batch yet.</p>}
          <Err e={merr} />
          {eligible > 0 && <p><button className="btn" onClick={save}>Save marks</button> <span className="ok">{msg}</span></p>}
        </div>
      )}
    </>
  )
}

const TABS = ['Dashboard', 'Students', 'Batches', 'Attendance', 'Fees', 'Tests']

export default function App() {
  const [auth, setAuth] = useState(!!localStorage.getItem('token')), [tab, setTab] = useState('Dashboard')
  if (!auth) return <Login onIn={() => setAuth(true)} />
  const pages = { Dashboard, Students, Batches, Attendance, Fees, Tests }
  const Page = pages[tab]
  return (
    <div className="shell">
      <nav>
        <h2>Tuition<br />Manager</h2>
        {TABS.map((n) => <button key={n} className={n === tab ? 'on' : ''} onClick={() => setTab(n)}>{n}</button>)}
        <button className="out" onClick={() => { localStorage.removeItem('token'); setAuth(false) }}>Log out</button>
      </nav>
      <main><h1>{tab}</h1><Page go={setTab} /></main>
    </div>
  )
}
