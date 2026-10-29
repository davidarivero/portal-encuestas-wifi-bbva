(function () {
  'use strict';

  const C = {
    blue: '#001391', navy: '#070e46', core: '#004481', medium: '#1973b8', light: '#85c8ff',
    ice: '#d4edfc', aqua: '#2dcccd', yellow: '#f8cd51', red: '#da3851', green: '#48ae64', grey: '#bdbdbd',
  };
  const SERIES = [C.blue, C.aqua, C.medium, C.light, C.core, C.yellow, C.navy];
  const RATING_COLORS = [C.red, '#e77d8e', C.yellow, C.light, C.green];

  Chart.defaults.font.family = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  Chart.defaults.color = '#4a4a4a';
  Chart.defaults.plugins.legend.position = 'bottom';
  Chart.defaults.maintainAspectRatio = false;

  const charts = {};
  const $ = (id) => document.getElementById(id);
  let data = { encuesta: null, respuestas: [] };

  // ---------- utilidades ----------
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else n.setAttribute(k, v);
    }
    for (const c of [].concat(children || [])) if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return n;
  }
  const fmtDate = (iso) => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' });
  const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const plural = (n) => `${n} ${n === 1 ? "respuesta" : "respuestas"}`;
  const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0) + '%';
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

  function normalizaPiso(p) {
    const s = String(p || '').trim();
    if (!s) return 'Sin dato';
    const m = s.match(/\d+/);
    if (m) return `Piso ${Number(m[0])}`;
    return s.toUpperCase().replace(/^PISO\s*/, 'Piso ');
  }

  function count(rows, key, options) {
    const counts = new Map((options || []).map((o) => [o, 0]));
    rows.forEach((r) => list(r.respuestas[key]).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
    return counts;
  }

  function draw(id, config) {
    if (charts[id]) charts[id].destroy();
    const canvas = $(id);
    const box = canvas.parentElement;
    const old = box.querySelector('.empty');
    if (old) old.remove();
    const hasData = config.data.datasets.some((d) => d.data.some((v) => v > 0));
    canvas.classList.toggle('hidden', !hasData);
    if (!hasData) { box.appendChild(el('div', { class: 'empty', text: 'Sin respuestas en este periodo.' })); return; }
    charts[id] = new Chart(canvas, config);
  }

  function bar(id, counts, { horizontal = false, color = C.blue } = {}) {
    const entries = [...counts.entries()];
    draw(id, {
      type: 'bar',
      data: { labels: entries.map((e) => e[0]), datasets: [{ data: entries.map((e) => e[1]), backgroundColor: color, borderRadius: 3, maxBarThickness: 44 }] },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        plugins: { legend: { display: false } },
        scales: { [horizontal ? 'x' : 'y']: { beginAtZero: true, ticks: { precision: 0 } }, [horizontal ? 'y' : 'x']: { grid: { display: false } } },
      },
    });
  }

  function doughnut(id, counts, colors) {
    const entries = [...counts.entries()];
    draw(id, {
      type: 'doughnut',
      data: { labels: entries.map((e) => e[0]), datasets: [{ data: entries.map((e) => e[1]), backgroundColor: colors || SERIES, borderColor: '#fff', borderWidth: 2 }] },
      options: { cutout: '60%' },
    });
  }

  function textList(boxId, rows, key, emptyText) {
    const box = $(boxId);
    box.replaceChildren();
    const items = rows.filter((r) => String(r.respuestas[key] || '').trim());
    if (!items.length) { box.appendChild(el('div', { class: 'empty', text: emptyText })); return; }
    items.forEach((r) => box.appendChild(el('div', { class: 'comment' }, [
      el('div', { class: 'meta', text: `${fmtDate(r.creado_en)} · ${'★'.repeat(r.calificacion)} · ${normalizaPiso(r.respuestas.piso)} · ${r.respuestas.colaborador || ''}` }),
      el('div', { text: r.respuestas[key] }),
    ])));
  }

  // ---------- render ----------
  function render() {
    const rows = data.respuestas;
    const s = data.encuesta.sections;
    const total = rows.length;
    const n5 = rows.filter((r) => r.calificacion === 5).length;
    const n4 = rows.filter((r) => r.calificacion === 4).length;
    const n13 = total - n5 - n4;
    $('k-total').textContent = total;
    $('k-avg').textContent = total ? (rows.reduce((a, r) => a + r.calificacion, 0) / total).toFixed(2) : '–';
    $('k-5').textContent = pct(n5, total); $('k-5n').textContent = plural(n5);
    $('k-4').textContent = pct(n4, total); $('k-4n').textContent = plural(n4);
    $('k-13').textContent = pct(n13, total); $('k-13n').textContent = plural(n13);

    // General
    const ratingCounts = new Map([1, 2, 3, 4, 5].map((i) => [`${i}★`, rows.filter((r) => r.calificacion === i).length]));
    draw('c-rating', {
      type: 'bar',
      data: { labels: [...ratingCounts.keys()], datasets: [{ data: [...ratingCounts.values()], backgroundColor: RATING_COLORS, borderRadius: 3, maxBarThickness: 56 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } },
    });

    const days = new Map();
    [...rows].reverse().forEach((r) => { const k = dayKey(r.creado_en); days.set(k, (days.get(k) || 0) + 1); });
    draw('c-days', {
      type: 'line',
      data: { labels: [...days.keys()], datasets: [{ data: [...days.values()], borderColor: C.blue, backgroundColor: 'rgba(0,19,145,.12)', fill: true, tension: .3, pointRadius: 3 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } },
    });

    doughnut('c-colab', count(rows, 'colaborador', ['Interno', 'Externo']), [C.blue, C.aqua]);
    const canal = new Map([['Encuestador', 0], ['Autoservicio (liga / QR)', 0]]);
    rows.forEach((r) => { const k = r.respuestas.canal === 'encuestador' ? 'Encuestador' : 'Autoservicio (liga / QR)'; canal.set(k, canal.get(k) + 1); });
    doughnut('c-canal', canal, [C.yellow, C.blue]);
    bar('c-equipos', count(rows, 'equipos', s.excelente.questions[1].options), { color: C.medium });

    const pisos = new Map();
    rows.forEach((r) => {
      const k = normalizaPiso(r.respuestas.piso);
      const p = pisos.get(k) || { sum: 0, n: 0 };
      p.sum += r.calificacion; p.n += 1; pisos.set(k, p);
    });
    const pisoEntries = [...pisos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }));
    draw('c-pisos', {
      type: 'bar',
      data: {
        labels: pisoEntries.map((e) => `${e[0]} (${e[1].n})`),
        datasets: [{ data: pisoEntries.map((e) => +(e[1].sum / e[1].n).toFixed(2)), backgroundColor: pisoEntries.map((e) => RATING_COLORS[Math.max(0, Math.round(e[1].sum / e[1].n) - 1)]), borderRadius: 3, maxBarThickness: 44 }],
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 5, ticks: { stepSize: 1 } }, x: { grid: { display: false } } } },
    });

    // Buena (4★)
    const buena = rows.filter((r) => r.seccion === 'buena');
    bar('c-mejoras', count(buena, 'mejoras', s.buena.questions[0].options), { horizontal: true, color: C.medium });
    bar('c-dispositivo', count(buena, 'dispositivo_problema', s.buena.questions[2].options), { color: C.aqua });
    textList('l-mejoras-otro', buena, 'mejoras_otro', 'Nadie escribió otro aspecto.');

    // Problemas (1-3★)
    const prob = rows.filter((r) => r.seccion === 'problemas');
    bar('c-problemas', count(prob, 'problemas', s.problemas.questions[0].options), { horizontal: true, color: C.red });
    doughnut('c-frecuencia', count(prob, 'frecuencia', s.problemas.questions[1].options), [C.red, C.yellow, C.light]);
    doughnut('c-reportado', count(prob, 'reportado', s.problemas.questions[3].options), [C.blue, C.grey, C.aqua]);
    textList('l-problemas-otro', prob, 'problemas_otro', 'Nadie escribió otro problema.');

    textList('l-comentarios', rows, 'comentarios', 'Aún no hay comentarios.');
    renderTable(rows);
  }

  function renderTable(rows) {
    const tbody = $('rows');
    tbody.replaceChildren();
    if (!rows.length) {
      tbody.appendChild(el('tr', {}, el('td', { colspan: '11', class: 'empty', text: 'Sin respuestas en este periodo.' })));
      return;
    }
    rows.forEach((r) => {
      const a = r.respuestas;
      const detalle = r.seccion === 'buena'
        ? [...list(a.mejoras), a.mejoras_otro].filter(Boolean).join(', ')
        : r.seccion === 'problemas' ? [...list(a.problemas), a.problemas_otro].filter(Boolean).join(', ') : '';
      const equipo = [...list(a.equipos), ...list(a.dispositivo_problema)].join(', ');
      const del = el('button', { class: 'btn btn-danger', type: 'button', title: 'Eliminar respuesta', text: 'Eliminar' });
      del.addEventListener('click', () => remove(r.id));
      tbody.appendChild(el('tr', {}, [
        el('td', { text: fmtDate(r.creado_en) }),
        el('td', { text: a.canal === 'encuestador' ? 'Encuestador' : 'Autoservicio' }),
        el('td', {}, el('span', { class: `pill s${r.calificacion}`, text: '★'.repeat(r.calificacion) })),
        el('td', { text: a.piso || '' }),
        el('td', { text: a.colaborador || '' }),
        el('td', { text: equipo }),
        el('td', { text: detalle }),
        el('td', { text: a.frecuencia || '' }),
        el('td', { text: a.reportado || '' }),
        el('td', { text: a.comentarios || '' }),
        el('td', {}, del),
      ]));
    });
  }

  // ---------- datos ----------
  function query() {
    const fd = new FormData($('filters'));
    const p = new URLSearchParams();
    if (fd.get('desde')) p.set('desde', fd.get('desde'));
    if (fd.get('hasta')) p.set('hasta', fd.get('hasta'));
    return p.toString();
  }

  async function load() {
    const q = query();
    $('export').href = '/admin/api/exportar.csv' + (q ? `?${q}` : '');
    const fd = new FormData($('filters'));
    $('k-range').textContent = fd.get('desde') || fd.get('hasta') ? `${fd.get('desde') || 'inicio'} a ${fd.get('hasta') || 'hoy'}` : 'Todo el periodo';
    const res = await fetch('/admin/api/respuestas' + (q ? `?${q}` : ''));
    if (res.status === 401) { location.href = '/admin/login'; return; }
    data = await res.json();
    render();
  }

  async function remove(id) {
    if (!confirm('¿Eliminar esta respuesta? Esta acción no se puede deshacer.')) return;
    const res = await fetch(`/admin/api/respuestas/${id}`, { method: 'DELETE' });
    if (res.status === 401) { location.href = '/admin/login'; return; }
    if (!res.ok) { alert('No se pudo eliminar.'); return; }
    load();
  }

  // ---------- eventos ----------
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    document.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== t.dataset.tab));
    Object.values(charts).forEach((c) => c.resize());
  }));
  $('filters').addEventListener('submit', (e) => { e.preventDefault(); load(); });
  $('clear').addEventListener('click', () => { $('filters').reset(); load(); });

  $('survey-url').textContent = `${location.origin}/`;
  $('surveyor-url').textContent = `${location.origin}/encuestador`;
  document.querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($(btn.dataset.copy).textContent); btn.textContent = 'Copiada'; setTimeout(() => (btn.textContent = 'Copiar'), 1500); } catch (_) { /* sin permiso de portapapeles */ }
  }));

  fetch('/admin/api/yo').then((r) => r.json()).then((u) => { $('who').textContent = u.name; }).catch(() => {});
  load();
})();
