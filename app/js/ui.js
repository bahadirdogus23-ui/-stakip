// Tablo tanımından otomatik form + filtrelenebilir liste + Excel/PDF çıktısı üretir.
import * as db from './db.js';
import { SCHEMAS, refLabel } from './schemas.js';
import { FIYAT_KODLARI } from './domain.js';
import { esc, fmtDate, fmtNum, fmtTL, fmtPct, toast, download, printHtml, today, fileSafe } from './util.js';
import { xlsxBlob } from './xlsx.js';
import { normKod } from './calc.js';
import { raporSayfa } from './reports.js';

const defVal = f => typeof f.def === 'function' ? f.def() : (f.def ?? '');

function listOptions(c, f) {
  const vals = new Set(db.all(c).map(r => r[f.k]).filter(Boolean));
  if (f.list === 'fiyatKodlari') {
    Object.keys(FIYAT_KODLARI).forEach(k => vals.add(k));
    db.all('birim_fiyat').forEach(r => r.kod && vals.add(r.kod));
  }
  return [...vals].sort((a, b) => String(a).localeCompare(String(b), 'tr')).map(v => `<option value="${esc(v)}">`).join('');
}

function refOptions(f, cur) {
  const rows = db.all(f.ref).map(r => [r.id, SCHEMAS[f.ref].label(r)]).sort((a, b) => a[1].localeCompare(b[1], 'tr'));
  return `<option value="">—</option>` + rows.map(([id, l]) => `<option value="${id}" ${id === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

function inputHtml(c, f) {
  const req = f.req ? 'required' : '';
  const ph = f.ph ? `placeholder="${esc(f.ph)}"` : '';
  switch (f.t) {
    case 'textarea': return `<textarea name="${f.k}" ${req} ${ph}></textarea>`;
    case 'select': return `<select name="${f.k}" ${req}>${f.o.map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
    case 'ref': return `<select name="${f.k}" ${req} data-ref="${f.ref}">${refOptions(f)}</select>`;
    case 'check': return `<input type="checkbox" name="${f.k}">`;
    case 'number': return `<input type="number" step="any" inputmode="decimal" name="${f.k}" ${req} ${ph}>`;
    case 'datetime': return `<input type="datetime-local" name="${f.k}" ${req}>`;
    case 'date': case 'time': return `<input type="${f.t}" name="${f.k}" ${req}>`;
    default: return `<input type="text" name="${f.k}" ${req} ${ph} ${f.list ? `list="dl-${c}-${f.k}"` : ''} ${f.upper ? 'style="text-transform:uppercase"' : ''}>`
      + (f.list ? `<datalist id="dl-${c}-${f.k}">${listOptions(c, f)}</datalist>` : '');
  }
}

export function setFormValues(form, s, rec) {
  for (const f of s.fields) {
    if (f.noForm) continue;
    const el = form.elements[f.k];
    if (!el) continue;
    const v = rec ? rec[f.k] : defVal(f);
    if (f.t === 'check') el.checked = !!v;
    else el.value = v ?? '';
  }
}

function readForm(form, s) {
  const out = {};
  for (const f of s.fields) {
    if (f.noForm) continue;
    const el = form.elements[f.k];
    if (f.t === 'check') out[f.k] = el.checked;
    else if (f.t === 'number') out[f.k] = el.value === '' ? '' : Number(el.value);
    else out[f.k] = f.upper ? normKod(el.value) : el.value.trim();
  }
  return out;
}

// Liste sütunları: görünen alanlar + hesaplanan sütunlar.
export function columns(s, forExport = false) {
  const tmap = { number: 'n', date: 'd', datetime: 'dt' };
  return [
    ...s.fields.filter(f => forExport ? !f.noExport : !f.hide).map(f => ({ k: f.k, l: f.l, t: tmap[f.t] || 's', field: f, f: r => r[f.k] })),
    ...(s.computed || []),
  ];
}

export function cellValue(col, r) {
  const v = col.f(r);
  if (col.field?.t === 'ref') return refLabel(col.field.ref, v);
  if (col.field?.t === 'check') return v ? 'Evet' : '';
  return v;
}

export function cellText(col, v) {
  if (v === '' || v == null) return '';
  switch (col.t) {
    case 'd': case 'dt': return fmtDate(v);
    case 'n': return fmtNum(v);
    case 'money': return fmtTL(v);
    case 'pct': return fmtPct(v);
    default: return String(v);
  }
}

export function exportXlsx(title, cols, rows) {
  const types = cols.map(c => c.t === 'money' || c.t === 'pct' ? 'n' : c.t);
  const data = rows.map(r => cols.map(c => {
    const v = cellValue(c, r);
    return c.t === 'pct' && typeof v === 'number' ? Math.round(v * 1000) / 10 : v;
  }));
  const headers = cols.map(c => c.t === 'pct' ? c.l.replace(/ ?%$/, '') + ' (%)' : c.t === 'money' ? c.l + ' (₺)' : c.l);
  download(xlsxBlob(title, headers, data, types), fileSafe(`${title}-${today()}`) + '.xlsx');
}

export function tableHtml(cols, rows, { rowCls, actions } = {}) {
  return `<table class="grid"><thead><tr>${cols.map(c => `<th>${esc(c.l)}</th>`).join('')}${actions ? '<th></th>' : ''}</tr></thead>
  <tbody>${rows.map(r => `<tr class="${rowCls ? rowCls(r) : ''}">${cols.map((c, i) => {
    const txt = cellText(c, cellValue(c, r));
    const cls = [c.t === 'n' || c.t === 'money' || c.t === 'pct' ? 'num' : '', c.cls ? c.cls(r) : '', c.field?.t === 'textarea' ? 'long' : ''].join(' ');
    return `<td class="${cls}" data-col="${i}" title="${esc(txt)}">${esc(txt)}</td>`;
  }).join('')}${actions ? `<td class="acts">${actions(r)}</td>` : ''}</tr>`).join('')}</tbody></table>`;
}

// Genel kayıt ekranı (CRUD). Dönüş: { refresh(), edit(rec) }
export function crudView(c, root) {
  const s = SCHEMAS[c];
  const st = { filters: [], q: '', from: '', to: '', editId: null };
  const cols = columns(s);

  root.innerHTML = `
    ${s.help ? `<div class="help">ℹ ${esc(s.help)}</div>` : ''}
    <details class="card form-card" ${db.all(c).length < 3 ? 'open' : ''}>
      <summary><b class="form-mode">+ Yeni ${esc(s.title)}</b></summary>
      <form class="grid-form" autocomplete="off">
        ${s.fields.filter(f => !f.noForm).map(f => `<label class="${f.wide || f.t === 'textarea' ? 'wide' : ''} ${f.t === 'check' ? 'check' : ''}">
          <span>${esc(f.l)}${f.req ? ' *' : ''}</span>${inputHtml(c, f)}${f.help ? `<small>${esc(f.help)}</small>` : ''}</label>`).join('')}
        <div class="wide form-btns"><button class="primary" type="submit">Kaydet</button>
          <button type="button" class="btn cancel">Temizle / Vazgeç</button></div>
      </form>
    </details>
    <div class="toolbar">
      ${(s.quick || []).map((q, i) => `<button class="btn danger quick" data-q="${i}">${esc(q.l)}</button>`).join('')}
      <input type="search" class="q" placeholder="Ara...">
      ${s.dateField ? `<label class="inline">Başl. <input type="date" class="from"></label><label class="inline">Bitiş <input type="date" class="to"></label>` : ''}
      <button class="btn xls">⬇ Excel</button><button class="btn pdf">🖨 PDF/Yazdır</button>
      <span class="count muted"></span>
    </div>
    <div class="chips"></div>
    <div class="table-wrap"></div>`;

  const form = root.querySelector('form');
  const details = root.querySelector('details');
  const $ = sel => root.querySelector(sel);

  function resetForm() {
    st.editId = null;
    form.reset();
    setFormValues(form, s, null);
    $('.form-mode').textContent = '+ Yeni ' + s.title;
    details.classList.remove('editing');
  }

  function edit(rec) {
    st.editId = rec.id || null;
    setFormValues(form, s, { ...Object.fromEntries(s.fields.map(f => [f.k, defVal(f)])), ...rec });
    $('.form-mode').textContent = rec.id ? '✎ Düzenleniyor: ' + s.label(rec) : '+ Yeni ' + s.title;
    details.classList.toggle('editing', !!rec.id);
    details.open = true;
    details.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.querySelector('input:not([type=checkbox]),select,textarea')?.focus({ preventScroll: true });
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const prev = st.editId ? db.get(c, st.editId) : null;
    let rec = { ...(prev || {}), ...readForm(form, s) };
    if (st.editId) rec.id = st.editId;
    if (s.beforeSave) rec = s.beforeSave(rec, prev) || rec;
    const saved = await db.put(c, rec);
    if (s.afterSave) await s.afterSave(saved, prev);
    toast(prev ? 'Güncellendi' : 'Kaydedildi', 'ok');
    resetForm();
    if (!prev) form.querySelector('input,select,textarea')?.focus();
  });
  $('.cancel').addEventListener('click', resetForm);

  $('.q').addEventListener('input', e => { st.q = e.target.value.toLocaleLowerCase('tr-TR'); renderTable(); });
  if (s.dateField) {
    $('.from').addEventListener('change', e => { st.from = e.target.value; renderTable(); });
    $('.to').addEventListener('change', e => { st.to = e.target.value; renderTable(); });
  }
  root.querySelectorAll('.quick').forEach(b => b.addEventListener('click', () => {
    const rec = s.quick[b.dataset.q].fn();
    resetForm();
    edit(rec);
  }));

  function filtered() {
    let rows = db.all(c);
    if (st.from) rows = rows.filter(r => (r[s.dateField] || '').slice(0, 10) >= st.from);
    if (st.to) rows = rows.filter(r => (r[s.dateField] || '').slice(0, 10) <= st.to);
    for (const f of st.filters) rows = rows.filter(r => cellText(cols[f.col], cellValue(cols[f.col], r)) === f.val);
    if (st.q) rows = rows.filter(r => cols.some(col => cellText(col, cellValue(col, r)).toLocaleLowerCase('tr-TR').includes(st.q)));
    const sort = s.sort || (s.dateField ? (a, b) => String(b[s.dateField] || '').localeCompare(String(a[s.dateField] || '')) : null);
    return sort ? rows.sort(sort) : rows;
  }

  const actionsHtml = r => `<button class="btn sm" data-act="edit" data-id="${r.id}">Düzenle</button>`
    + (s.actions || []).map((a, i) => a.show && !a.show(r) ? '' : `<button class="btn sm" data-act="${i}" data-id="${r.id}">${esc(a.l)}</button>`).join('')
    + `<button class="btn sm del" data-act="del" data-id="${r.id}" title="Sil">✕</button>`;

  function renderTable() {
    const rows = filtered();
    const total = db.all(c).length;
    $('.count').textContent = rows.length === total ? `${total} kayıt` : `${rows.length} / ${total} kayıt`;
    $('.chips').innerHTML = st.filters.map((f, i) => `<span class="chip">${esc(cols[f.col].l)}: <b>${esc(f.val)}</b> <button data-chip="${i}">✕</button></span>`).join('')
      + (st.filters.length ? '<span class="muted small">Filtre eklemek için hücreye tıklayın</span>' : '<span class="muted small">İpucu: bir hücreye tıklayınca o değere göre filtrelenir</span>');
    $('.table-wrap').innerHTML = rows.length ? tableHtml(cols, rows, { rowCls: s.rowCls, actions: actionsHtml }) : '<div class="empty">Kayıt yok.</div>';
  }

  root.addEventListener('click', async e => {
    const chip = e.target.closest('[data-chip]');
    if (chip) { st.filters.splice(+chip.dataset.chip, 1); return renderTable(); }
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const rec = db.get(c, btn.dataset.id);
      if (!rec) return;
      if (btn.dataset.act === 'edit') return edit(rec);
      if (btn.dataset.act === 'del') {
        if (!confirm(`Silinsin mi?\n${s.label(rec)}`)) return;
        await db.remove(c, rec.id);
        if (s.afterDelete) await s.afterDelete(rec);
        if (st.editId === rec.id) resetForm();
        return toast('Silindi');
      }
      return s.actions[+btn.dataset.act].fn(rec);
    }
    const td = e.target.closest('td[data-col]');
    if (td && td.textContent.trim()) {
      st.filters.push({ col: +td.dataset.col, val: td.textContent });
      renderTable();
    }
  });

  $('.xls').addEventListener('click', () => exportXlsx(s.title, columns(s, true), filtered()));
  $('.pdf').addEventListener('click', () => {
    const rows = filtered();
    const filtre = [...st.filters.map(f => `${cols[f.col].l}: ${f.val}`), st.from && 'Başl: ' + fmtDate(st.from), st.to && 'Bitiş: ' + fmtDate(st.to), st.q && 'Arama: ' + st.q].filter(Boolean).join(' · ');
    printHtml(raporSayfa(s.title.toLocaleUpperCase('tr-TR') + ' LİSTESİ',
      `${filtre ? `<p>Filtre: ${esc(filtre)}</p>` : ''}<p>${rows.length} kayıt</p>${tableHtml(cols, rows, { rowCls: s.rowCls })}`).replace('class="doc"', 'class="doc wide"'));
  });

  function refresh() {
    // Seçim kutuları ve öneri listelerini güncelle (form değerleri korunur).
    form.querySelectorAll('select[data-ref]').forEach(sel => {
      const v = sel.value;
      sel.innerHTML = refOptions(s.fields.find(f => f.k === sel.name), v);
      sel.value = v;
    });
    form.querySelectorAll('datalist').forEach(dl => {
      const f = s.fields.find(x => dl.id === `dl-${c}-${x.k}`);
      if (f) dl.innerHTML = listOptions(c, f);
    });
    renderTable();
  }

  resetForm();
  renderTable();
  return { refresh, edit };
}
