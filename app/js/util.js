// Genel yardımcılar: biçimlendirme, tarih, indirme, yazdırma, bildirim kutusu.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const nowLocal = (d = new Date()) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const addDays = (s, n) => { const d = new Date(s.slice(0, 10) + 'T00:00'); d.setDate(d.getDate() + n); return ymd(d); };

export const isEmpty = v => v === '' || v == null || (typeof v === 'number' && isNaN(v));

export function fmtNum(v, digits = 2) {
  if (isEmpty(v) || !isFinite(v)) return '';
  return Number(v).toLocaleString('tr-TR', { maximumFractionDigits: digits });
}
export const fmtTL = v => isEmpty(v) ? '' : fmtNum(v, 2) + ' ₺';
export const fmtPct = v => isEmpty(v) || !isFinite(v) ? '' : '%' + fmtNum(v * 100, 1);

// "2026-10-09" -> "09.10.2026", "2026-10-09T14:30" -> "09.10.2026 14:30"
export function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d}.${m}.${y}` + (s.length > 10 ? ' ' + s.slice(11, 16) : '');
}

export function toast(msg, kind = 'info', ms = 3500) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

export function download(content, name, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Sadece verilen içeriği yazdırır (tarayıcıda "PDF olarak kaydet" seçilebilir).
export function printHtml(html) {
  const area = document.getElementById('print-area');
  area.innerHTML = html;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

// Dosya adları ASCII'ye çevrilir (bazı tarayıcı/e-posta sistemleri Türkçe harfli adları bozar).
const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' };
export const fileSafe = s => String(s).replace(/[çğıöşüÇĞİÖŞÜ]/g, c => TR[c]).replace(/[^\w.-]+/g, '_').slice(0, 60);
