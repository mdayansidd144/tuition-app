const API_URL = 'https://tuition-app-pbx5.onrender.com/api'
const token = () => localStorage.getItem('token')

const label = (k) => (['detail', 'non_field_errors', 'records'].includes(k) ? '' : k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) + ': ')
function fmt(d) {
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map(fmt).join('; ')
  if (d && typeof d === 'object') return Object.entries(d).map(([k, v]) => label(k) + fmt(v)).join(' | ')
  return String(d)
}

export async function api(path, opts = {}) {
  // UPDATED: Added API_URL here
  const r = await fetch(API_URL + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Token ' + token() } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (r.status === 401 && token()) { localStorage.removeItem('token'); location.reload() }
  if (!r.ok) {
    let msg = r.statusText
    try { msg = fmt(await r.json()) } catch {}
    throw new Error(msg)
  }
  return r.status === 204 ? null : r.json()
}

export async function openPdf(path) {
  // UPDATED: Added API_URL here
  const r = await fetch(API_URL + path, { headers: { Authorization: 'Token ' + token() } })
  window.open(URL.createObjectURL(await r.blob()), '_blank')
}

// Free "click-to-chat" WhatsApp link: no paid API needed
export function wa(phone, text) {
  const d = (phone || '').replace(/\D/g, '')
  const n = d.length === 10 ? '91' + d : d
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}

export const today = () => new Date().toISOString().slice(0, 10)
export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
export const digits = (v) => v.replace(/\D/g, '').slice(0, 10)