// Reporte ejecutivo del periodo: resumen de datos + exportación a PDF y PowerPoint.

const path = require('path');
const PDFDocument = require('pdfkit');
const PptxGenJS = require('pptxgenjs');

const IMG = path.join(__dirname, '..', 'public', 'img');
const LOGO_WHITE = path.join(IMG, 'bbva-logo.png');

const C = {
  blue: '001391', navy: '070E46', core: '004481', medium: '1973B8', light: '85C8FF',
  ice: 'D4EDFC', aqua: '2DCCCD', yellow: 'F8CD51', red: 'DA3851', green: '48AE64', grey: 'BDBDBD', ink: '121212', ink2: '4A4A4A',
};
const RATING_COLORS = [C.red, 'E77D8E', C.yellow, C.light, C.green];

// ---------- resumen ----------

const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const avg = (rows) => (rows.length ? rows.reduce((a, r) => a + r.calificacion, 0) / rows.length : 0);

function normalizaPiso(p) {
  const s = String(p || '').trim();
  if (!s) return 'Sin dato';
  const m = s.match(/\d+/);
  if (m) return `Piso ${Number(m[0])}`;
  return s.toUpperCase().replace(/^PISO\s*/, 'Piso ');
}

// Conteo por opción, ordenado de mayor a menor. base = respuestas del grupo.
function ranking(rows, key, options) {
  const counts = new Map((options || []).map((o) => [o, 0]));
  rows.forEach((r) => list(r.respuestas[key]).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
  return [...counts.entries()].map(([label, n]) => ({ label, n, pct: pct(n, rows.length) })).sort((a, b) => b.n - a.n);
}

function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', year: 'numeric' });
}

function summarize(rows, survey, filters = {}) {
  const s = survey.sections;
  const total = rows.length;
  const dist = [1, 2, 3, 4, 5].map((i) => rows.filter((r) => r.calificacion === i).length);
  const n5 = dist[4];
  const n4 = dist[3];
  const n13 = total - n5 - n4;
  const buena = rows.filter((r) => r.seccion === 'buena');
  const prob = rows.filter((r) => r.seccion === 'problemas');

  const sedes = survey.sedes.map((name) => {
    const sub = rows.filter((r) => r.respuestas.sede === name);
    return { label: name, n: sub.length, avg: avg(sub) };
  });
  const sinSede = rows.filter((r) => !r.respuestas.sede).length;
  if (sinSede) sedes.push({ label: 'Sin sede', n: sinSede, avg: avg(rows.filter((r) => !r.respuestas.sede)) });

  // Los mismos números de piso existen en las dos sedes: si hay más de una sede, se separan.
  const variasSedes = new Set(rows.map((r) => r.respuestas.sede || '')).size > 1;
  const pisosMap = new Map();
  rows.forEach((r) => {
    const sede = (r.respuestas.sede || '').split(' ').pop();
    const k = variasSedes && sede ? `${sede} · ${normalizaPiso(r.respuestas.piso)}` : normalizaPiso(r.respuestas.piso);
    const p = pisosMap.get(k) || { label: k, n: 0, sum: 0 };
    p.n += 1; p.sum += r.calificacion; pisosMap.set(k, p);
  });
  const pisos = [...pisosMap.values()].map((p) => ({ label: p.label, n: p.n, avg: p.sum / p.n }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }));

  const summary = {
    total,
    avg: avg(rows),
    dist,
    n5, n4, n13,
    p5: pct(n5, total), p4: pct(n4, total), p13: pct(n13, total),
    canal: {
      encuestador: rows.filter((r) => r.respuestas.canal === 'encuestador').length,
      autoservicio: rows.filter((r) => r.respuestas.canal !== 'encuestador').length,
    },
    sedes,
    colaborador: ranking(rows, 'colaborador', ['Interno', 'Externo']),
    equipos: ranking(rows.filter((r) => r.seccion !== 'buena'), 'equipos', s.excelente.questions[1].options),
    pisos,
    nBuena: buena.length,
    mejoras: ranking(buena, 'mejoras', s.buena.questions[0].options),
    nProb: prob.length,
    problemas: ranking(prob, 'problemas', s.problemas.questions[0].options),
    frecuencia: ranking(prob, 'frecuencia', s.problemas.questions[1].options),
    reportado: ranking(prob, 'reportado', s.problemas.questions[3].options),
    otros: [...buena.map((r) => r.respuestas.mejoras_otro), ...prob.map((r) => r.respuestas.problemas_otro)].filter(Boolean).slice(0, 8),
    comentarios: rows
      .filter((r) => String(r.respuestas.comentarios || '').trim())
      .slice(0, 8)
      .map((r) => ({ text: r.respuestas.comentarios, meta: `${r.calificacion} estrellas · ${normalizaPiso(r.respuestas.piso)}${r.respuestas.sede ? ` · ${r.respuestas.sede}` : ''}` })),
  };

  summary.periodo = filters.desdeTxt || filters.hastaTxt
    ? `${filters.desdeTxt ? fmtDay(`${filters.desdeTxt}T12:00:00-06:00`) : 'Inicio'} al ${filters.hastaTxt ? fmtDay(`${filters.hastaTxt}T12:00:00-06:00`) : fmtDay(new Date().toISOString())}`
    : rows.length
      ? `${fmtDay(rows[rows.length - 1].creado_en)} al ${fmtDay(rows[0].creado_en)}`
      : 'Sin respuestas';
  summary.sede = filters.sede || 'Todas las sedes';
  summary.generado = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'long', timeStyle: 'short' });
  summary.hallazgos = findings(summary);
  return summary;
}

function findings(sm) {
  if (!sm.total) return ['No hay respuestas registradas en el periodo seleccionado.'];
  const out = [];
  out.push(`Se recibieron ${sm.total} respuestas con una calificación promedio de ${sm.avg.toFixed(2)} de 5.`);
  out.push(`El ${sm.p5}% calificó su experiencia como excelente (5), el ${sm.p4}% como buena (4) y el ${sm.p13}% reportó problemas (1 a 3).`);
  const conSede = sm.sedes.filter((x) => x.n > 0 && x.label !== 'Sin sede');
  if (conSede.length > 1) {
    const [best, worst] = [...conSede].sort((a, b) => b.avg - a.avg);
    out.push(`${best.label} tiene mejor calificación (${best.avg.toFixed(2)}) que ${worst.label} (${worst.avg.toFixed(2)}).`);
  }
  if (sm.nProb && sm.problemas[0].n) {
    const p = sm.problemas[0];
    out.push(`El problema más mencionado es "${p.label}", presente en el ${p.pct}% de las respuestas con problemas.`);
    const frec = sm.frecuencia.find((f) => f.label === 'Me ocurre frecuentemente');
    if (frec && frec.n) out.push(`Al ${frec.pct}% de quienes tienen problemas le ocurren frecuentemente.`);
    const si = sm.reportado.find((f) => f.label === 'Sí');
    const nosabe = sm.reportado.find((f) => f.label === 'No sabía cómo reportarlo');
    out.push(`Solo el ${si ? si.pct : 0}% lo ha reportado a soporte técnico${nosabe && nosabe.n ? ` y el ${nosabe.pct}% no sabía cómo hacerlo` : ''}.`);
  }
  if (sm.nBuena && sm.mejoras[0].n) out.push(`Entre quienes calificaron con 4, la mejora más solicitada es "${sm.mejoras[0].label}" (${sm.mejoras[0].pct}%).`);
  const peores = sm.pisos.filter((p) => p.label !== 'Sin dato').sort((a, b) => a.avg - b.avg || b.n - a.n).slice(0, 3).filter((p) => p.avg < 4);
  if (peores.length) out.push(`Pisos con menor calificación: ${peores.map((p) => `${p.label} (${p.avg.toFixed(1)}, ${p.n} resp.)`).join(', ')}.`);
  return out;
}

// ---------- PDF ----------

function hex(c) { return `#${c}`; }

function renderPdf(sm) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', bufferPages: true, margins: { top: 48, left: 48, right: 48, bottom: 20 }, info: { Title: 'Reporte ejecutivo · Experiencia Wi-Fi BBVA', Author: 'BBVA' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const M = 48;
    const CW = W - M * 2;

    function header(title) {
      doc.rect(0, 0, W, 64).fill(hex(C.blue));
      doc.image(LOGO_WHITE, M, 22, { height: 20 });
      doc.fillColor('#ffffff').font('Helvetica').fontSize(10).text(title, M + 90, 28, { width: CW - 90, align: 'right' });
      doc.y = 88;
    }
    function footer() {
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.font('Helvetica').fontSize(8).fillColor(hex(C.ink2))
          .text(`Encuesta de experiencia Wi-Fi · ${sm.sede} · Página ${i + 1} de ${range.count}`, M, doc.page.height - 34, { width: CW, align: 'center', lineBreak: false });
      }
    }
    function sectionTitle(t) {
      ensure(110); // que el título no quede solo al final de la página
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(14).fillColor(hex(C.navy)).text(t, M, doc.y);
      doc.moveTo(M, doc.y + 3).lineTo(M + 40, doc.y + 3).lineWidth(2).strokeColor(hex(C.aqua)).stroke();
      doc.moveDown(0.7);
    }
    function ensure(h) {
      if (doc.y + h > doc.page.height - 56) { doc.addPage(); header('Reporte ejecutivo · Experiencia Wi-Fi'); }
    }
    // Barras horizontales con su valor y porcentaje.
    function hbars(items, { color = C.blue, valueText, max } = {}) {
      const labelW = 240;
      const barW = CW - labelW - 80;
      const top = max || Math.max(1, ...items.map((i) => i.value));
      items.forEach((it) => {
        ensure(22);
        const y = doc.y;
        doc.font('Helvetica').fontSize(9).fillColor(hex(C.ink)).text(it.label, M, y + 2, { width: labelW - 8, height: 20, ellipsis: true });
        doc.roundedRect(M + labelW, y, barW, 14, 2).fill('#eef1f7');
        const w = Math.max(it.value > 0 ? 3 : 0, (it.value / top) * barW);
        if (w) doc.roundedRect(M + labelW, y, w, 14, 2).fill(hex(it.color || color));
        doc.font('Helvetica-Bold').fontSize(9).fillColor(hex(C.navy)).text(valueText ? valueText(it) : String(it.value), M + labelW + barW + 8, y + 2, { width: 72 });
        doc.y = y + 21;
      });
    }
    function empty(t) { doc.font('Helvetica-Oblique').fontSize(10).fillColor(hex(C.ink2)).text(t, M, doc.y); doc.moveDown(0.5); }

    // Portada
    doc.rect(0, 0, W, 230).fill(hex(C.blue));
    doc.rect(0, 230, W, 6).fill(hex(C.aqua));
    doc.image(LOGO_WHITE, M, 44, { height: 30 });
    doc.fillColor('#ffffff').font('Helvetica').fontSize(26).text('Reporte ejecutivo', M, 110);
    doc.fontSize(15).fillColor(hex(C.light)).text('Tu experiencia Wi-Fi nos importa', M, 146);
    doc.fontSize(10).fillColor('#ffffff').text(`Periodo: ${sm.periodo}   ·   Sede: ${sm.sede}`, M, 182);
    doc.fontSize(8).fillColor(hex(C.light)).text(`Generado el ${sm.generado}`, M, 200);
    doc.y = 262;

    // Indicadores
    const kpis = [
      ['Respuestas', String(sm.total), C.blue],
      ['Promedio', sm.total ? sm.avg.toFixed(2) : '–', C.blue],
      ['Excelente (5)', `${sm.p5}%`, C.green],
      ['Buena (4)', `${sm.p4}%`, C.light],
      ['Con problemas (1-3)', `${sm.p13}%`, C.red],
    ];
    const kw = (CW - 4 * 10) / 5;
    const ky = doc.y;
    kpis.forEach(([lbl, val, color], i) => {
      const x = M + i * (kw + 10);
      doc.rect(x, ky, kw, 66).fill('#f4f6fa');
      doc.rect(x, ky, kw, 4).fill(hex(color));
      doc.font('Helvetica').fontSize(8).fillColor(hex(C.ink2)).text(lbl, x + 10, ky + 14, { width: kw - 16 });
      doc.font('Helvetica').fontSize(22).fillColor(hex(C.navy)).text(val, x + 10, ky + 30, { width: kw - 16 });
    });
    doc.y = ky + 80;
    doc.font('Helvetica').fontSize(9).fillColor(hex(C.ink2))
      .text(`Encuestador: ${sm.canal.encuestador}   ·   Autoservicio (liga / QR): ${sm.canal.autoservicio}`, M, doc.y);

    sectionTitle('Hallazgos clave');
    sm.hallazgos.forEach((h) => {
      ensure(30);
      const y = doc.y;
      doc.circle(M + 4, y + 5, 2.5).fill(hex(C.blue));
      doc.font('Helvetica').fontSize(10.5).fillColor(hex(C.ink)).text(h, M + 14, y, { width: CW - 14 });
      doc.moveDown(0.45);
    });

    sectionTitle('Distribución de calificaciones');
    hbars([5, 4, 3, 2, 1].map((i) => ({ label: `${i} ${i === 1 ? 'estrella' : 'estrellas'}`, value: sm.dist[i - 1], color: RATING_COLORS[i - 1] })),
      { valueText: (it) => `${it.value} · ${pct(it.value, sm.total)}%` });

    sectionTitle('Por sede');
    hbars(sm.sedes.map((x) => ({ label: x.label, value: x.n, avg: x.avg })), { color: C.blue, valueText: (it) => (it.value ? `${it.value} · ${it.avg.toFixed(2)}` : '0') });
    doc.font('Helvetica').fontSize(8).fillColor(hex(C.ink2)).text('Valor: respuestas · calificación promedio', M, doc.y);

    sectionTitle(`Con problemas (1 a 3) · ${sm.nProb} respuestas`);
    if (!sm.nProb) empty('Sin respuestas con problemas en el periodo.');
    else {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(hex(C.ink2)).text('Principal problema', M, doc.y); doc.moveDown(0.4);
      hbars(sm.problemas.map((x) => ({ label: x.label, value: x.n, pct: x.pct })), { color: C.red, valueText: (it) => `${it.value} · ${it.pct}%` });
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(hex(C.ink2)).text('Frecuencia', M, doc.y); doc.moveDown(0.4);
      hbars(sm.frecuencia.map((x) => ({ label: x.label, value: x.n, pct: x.pct })), { color: C.yellow, valueText: (it) => `${it.value} · ${it.pct}%` });
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(hex(C.ink2)).text('¿Lo reportó a soporte técnico?', M, doc.y); doc.moveDown(0.4);
      hbars(sm.reportado.map((x) => ({ label: x.label, value: x.n, pct: x.pct })), { color: C.blue, valueText: (it) => `${it.value} · ${it.pct}%` });
    }

    sectionTitle(`Buena (4) · ${sm.nBuena} respuestas`);
    if (!sm.nBuena) empty('Sin respuestas de 4 estrellas en el periodo.');
    else hbars(sm.mejoras.map((x) => ({ label: x.label, value: x.n, pct: x.pct })), { color: C.medium, valueText: (it) => `${it.value} · ${it.pct}%` });

    sectionTitle('Equipo de trabajo');
    hbars(sm.equipos.map((x) => ({ label: x.label, value: x.n, pct: x.pct })), { color: C.aqua, valueText: (it) => `${it.value} · ${it.pct}%` });

    sectionTitle('Calificación promedio por piso');
    if (!sm.pisos.length) empty('Sin datos.');
    else hbars(sm.pisos.map((p) => ({ label: `${p.label} (${p.n})`, value: p.avg, color: RATING_COLORS[Math.max(0, Math.round(p.avg) - 1)] })), { max: 5, valueText: (it) => it.value.toFixed(2) });

    sectionTitle('Comentarios recientes');
    if (!sm.comentarios.length) empty('Sin comentarios en el periodo.');
    sm.comentarios.forEach((c) => {
      ensure(44);
      const y = doc.y;
      doc.font('Helvetica').fontSize(10).fillColor(hex(C.ink));
      const h = doc.heightOfString(`"${c.text}"`, { width: CW - 16 });
      doc.rect(M, y, 3, h + 16).fill(hex(C.light));
      doc.fillColor(hex(C.ink)).text(`"${c.text}"`, M + 12, y + 2, { width: CW - 16 });
      doc.font('Helvetica').fontSize(8).fillColor(hex(C.ink2)).text(c.meta, M + 12, doc.y + 2);
      doc.y += 10;
    });

    footer();
    doc.end();
  });
}

// ---------- PowerPoint ----------

async function renderPptx(sm) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  pptx.title = 'Reporte ejecutivo · Experiencia Wi-Fi BBVA';
  pptx.company = 'BBVA';
  const FONT = 'Arial';

  pptx.defineSlideMaster({
    title: 'BBVA',
    background: { color: 'FFFFFF' },
    objects: [
      { rect: { x: 0, y: 0, w: 13.33, h: 0.75, fill: { color: C.blue } } },
      { image: { path: LOGO_WHITE, x: 0.5, y: 0.22, h: 0.32, w: 1.06 } },
      { text: { text: 'Encuesta de experiencia Wi-Fi', options: { x: 7.3, y: 0.2, w: 5.5, h: 0.35, align: 'right', fontFace: FONT, fontSize: 11, color: 'FFFFFF' } } },
    ],
    slideNumber: { x: 12.4, y: 7.0, fontFace: FONT, fontSize: 9, color: C.ink2 },
  });

  const title = (slide, t, sub) => {
    slide.addText(t, { x: 0.5, y: 0.95, w: 12.3, h: 0.6, fontFace: FONT, fontSize: 26, color: C.navy });
    if (sub) slide.addText(sub, { x: 0.5, y: 1.5, w: 12.3, h: 0.35, fontFace: FONT, fontSize: 12, color: C.ink2 });
  };
  const noData = (slide, x, y, w, h, t) => slide.addText(t, { x, y, w, h, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 13, italic: true, color: C.ink2, fill: { color: 'F4F6FA' } });
  const chartBase = {
    showValue: true, dataLabelFontFace: FONT, dataLabelFontSize: 11, dataLabelColor: C.navy, dataLabelFontBold: true,
    catAxisLabelFontFace: FONT, catAxisLabelFontSize: 11, catAxisLabelColor: C.ink, valAxisHidden: true, valGridLine: { style: 'none' },
    catAxisLineShow: false, showLegend: false,
  };
  const barChart = (slide, items, opts) => {
    slide.addChart(pptx.ChartType.bar, [{ name: 'Respuestas', labels: items.map((i) => i.label), values: items.map((i) => i.n) }], {
      ...chartBase, barDir: 'bar', barGapWidthPct: 45, catAxisOrientation: 'maxMin', ...opts,
    });
  };
  const doughnut = (slide, items, colors, opts) => {
    slide.addChart(pptx.ChartType.doughnut, [{ name: 'Respuestas', labels: items.map((i) => i.label), values: items.map((i) => i.n) }], {
      holeSize: 55, chartColors: colors, showPercent: true, showValue: false, dataLabelColor: 'FFFFFF', dataLabelFontSize: 12, dataLabelFontBold: true,
      showLegend: true, legendPos: 'b', legendFontFace: FONT, legendFontSize: 11, ...opts,
    });
  };
  const box = (slide, t, x, y, w) => slide.addText(t, { x, y, w, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: C.navy });

  // 1. Portada
  let s = pptx.addSlide();
  s.background = { color: C.blue };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.9, w: 13.33, h: 0.6, fill: { color: C.navy } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.84, w: 13.33, h: 0.06, fill: { color: C.aqua } });
  s.addImage({ path: LOGO_WHITE, x: 0.8, y: 0.8, h: 0.6, w: 1.99 });
  s.addText('Reporte ejecutivo', { x: 0.8, y: 2.3, w: 11, h: 1, fontFace: FONT, fontSize: 44, color: 'FFFFFF' });
  s.addText('Tu experiencia Wi-Fi nos importa', { x: 0.8, y: 3.25, w: 11, h: 0.6, fontFace: FONT, fontSize: 24, color: C.light });
  s.addText(`Periodo: ${sm.periodo}\nSede: ${sm.sede}`, { x: 0.8, y: 4.3, w: 11, h: 0.9, fontFace: FONT, fontSize: 16, color: 'FFFFFF', paraSpaceAfter: 4 });
  s.addText(`Generado el ${sm.generado}`, { x: 0.8, y: 6.98, w: 11, h: 0.4, fontFace: FONT, fontSize: 11, color: C.light });

  // 2. Resumen
  s = pptx.addSlide({ masterName: 'BBVA' });
  title(s, 'Resumen del periodo', `${sm.periodo} · ${sm.sede}`);
  const kpis = [
    ['Respuestas', String(sm.total), C.blue],
    ['Calificación promedio', sm.total ? sm.avg.toFixed(2) : '–', C.blue],
    ['Excelente (5★)', `${sm.p5}%`, C.green],
    ['Buena (4★)', `${sm.p4}%`, C.light],
    ['Con problemas (1–3★)', `${sm.p13}%`, C.red],
  ];
  kpis.forEach(([lbl, val, color], i) => {
    const x = 0.5 + i * 2.5;
    s.addShape(pptx.ShapeType.rect, { x, y: 2.05, w: 2.3, h: 1.35, fill: { color: 'F4F6FA' } });
    s.addShape(pptx.ShapeType.rect, { x, y: 2.05, w: 2.3, h: 0.07, fill: { color } });
    s.addText(lbl, { x: x + 0.15, y: 2.2, w: 2.0, h: 0.35, fontFace: FONT, fontSize: 11, color: C.ink2 });
    s.addText(val, { x: x + 0.15, y: 2.55, w: 2.0, h: 0.7, fontFace: FONT, fontSize: 32, color: C.navy });
  });
  box(s, 'Hallazgos clave', 0.5, 3.7, 12);
  s.addText(sm.hallazgos.map((h) => ({ text: h, options: { bullet: { code: '25CF' }, paraSpaceAfter: 6 } })), {
    x: 0.5, y: 4.1, w: 12.3, h: 2.8, fontFace: FONT, fontSize: 14, color: C.ink, valign: 'top',
  });

  // 3. Calificaciones y sedes
  s = pptx.addSlide({ masterName: 'BBVA' });
  title(s, 'Calificaciones', `Encuestador: ${sm.canal.encuestador} · Autoservicio (liga / QR): ${sm.canal.autoservicio}`);
  box(s, 'Distribución de calificaciones', 0.5, 2.0, 6);
  if (!sm.total) noData(s, 0.5, 2.5, 6.3, 4.2, 'Sin respuestas en el periodo');
  else {
    s.addChart(pptx.ChartType.bar, [{ name: 'Respuestas', labels: ['1★', '2★', '3★', '4★', '5★'], values: sm.dist }], {
      ...chartBase, x: 0.5, y: 2.5, w: 6.3, h: 4.2, barDir: 'col', chartColors: RATING_COLORS, barGapWidthPct: 40,
    });
  }
  box(s, 'Respuestas por sede', 7.2, 2.0, 5.6);
  const sedesConDatos = sm.sedes.filter((x) => x.n);
  if (!sedesConDatos.length) noData(s, 7.2, 2.5, 5.6, 4.2, 'Sin respuestas en el periodo');
  else {
    doughnut(s, sedesConDatos, [C.blue, C.aqua, C.grey], { x: 7.2, y: 2.5, w: 5.6, h: 3.6 });
    s.addText(sedesConDatos.map((x) => `${x.label}: promedio ${x.avg.toFixed(2)}★`).join('     '), { x: 7.2, y: 6.2, w: 5.6, h: 0.4, align: 'center', fontFace: FONT, fontSize: 12, color: C.ink2 });
  }

  // 4. Problemas
  s = pptx.addSlide({ masterName: 'BBVA' });
  title(s, 'Usuarios con problemas (1 a 3★)', `${sm.nProb} respuestas · los porcentajes son sobre este grupo`);
  if (!sm.nProb) noData(s, 0.5, 2.0, 12.3, 4.8, 'Sin respuestas con problemas en el periodo');
  else {
    box(s, 'Principal problema', 0.5, 2.0, 7);
    barChart(s, sm.problemas, { x: 0.5, y: 2.4, w: 7.2, h: 4.5, chartColors: [C.red] });
    box(s, 'Frecuencia', 8.0, 2.0, 4.8);
    doughnut(s, sm.frecuencia, [C.red, C.yellow, C.light], { x: 8.0, y: 2.35, w: 4.8, h: 2.3, legendPos: 'r' });
    box(s, '¿Lo reportó a soporte técnico?', 8.0, 4.65, 4.8);
    doughnut(s, sm.reportado, [C.blue, C.grey, C.aqua], { x: 8.0, y: 5.0, w: 4.8, h: 2.0, legendPos: 'r' });
  }

  // 5. Mejoras y equipos
  s = pptx.addSlide({ masterName: 'BBVA' });
  title(s, 'Oportunidades de mejora', `Calificación 4★: ${sm.nBuena} respuestas`);
  box(s, '¿Qué aspectos mejorarían de la red?', 0.5, 2.0, 7);
  if (!sm.nBuena) noData(s, 0.5, 2.4, 7.2, 4.5, 'Sin respuestas de 4★ en el periodo');
  else barChart(s, sm.mejoras, { x: 0.5, y: 2.4, w: 7.2, h: 4.5, chartColors: [C.medium] });
  box(s, 'Equipo de trabajo', 8.0, 2.0, 4.8);
  if (!sm.equipos.some((e) => e.n)) noData(s, 8.0, 2.4, 4.8, 4.5, 'Sin datos');
  else barChart(s, sm.equipos, { x: 8.0, y: 2.4, w: 4.8, h: 4.5, chartColors: [C.aqua] });

  // 6. Pisos
  s = pptx.addSlide({ masterName: 'BBVA' });
  title(s, 'Calificación promedio por piso', 'Entre paréntesis, el número de respuestas');
  if (!sm.pisos.length) noData(s, 0.5, 2.0, 12.3, 4.8, 'Sin datos');
  else {
    s.addChart(pptx.ChartType.bar, [{ name: 'Promedio', labels: sm.pisos.map((p) => `${p.label} (${p.n})`), values: sm.pisos.map((p) => +p.avg.toFixed(2)) }], {
      ...chartBase, x: 0.5, y: 2.0, w: 12.3, h: 4.9, barDir: 'col', valAxisMinVal: 0, valAxisMaxVal: 5, dataLabelFormatCode: '0.00',
      chartColors: sm.pisos.map((p) => RATING_COLORS[Math.max(0, Math.round(p.avg) - 1)]), barGapWidthPct: 50,
    });
  }

  // 7. Comentarios
  s = pptx.addSlide({ masterName: 'BBVA' });
  title(s, 'Voz del usuario', 'Comentarios recientes del periodo');
  if (!sm.comentarios.length) noData(s, 0.5, 2.0, 12.3, 4.8, 'Sin comentarios en el periodo');
  sm.comentarios.slice(0, 6).forEach((c, i) => {
    const x = 0.5 + (i % 2) * 6.25;
    const y = 2.0 + Math.floor(i / 2) * 1.62;
    s.addShape(pptx.ShapeType.rect, { x, y, w: 6.05, h: 1.45, fill: { color: 'F4F6FA' }, line: { color: 'F4F6FA' } });
    s.addShape(pptx.ShapeType.rect, { x, y, w: 0.07, h: 1.45, fill: { color: C.light } });
    s.addText([
      { text: `“${c.text.length > 220 ? `${c.text.slice(0, 217)}…` : c.text}”`, options: { fontSize: 13, color: C.ink, breakLine: true } },
      { text: c.meta, options: { fontSize: 10, color: C.ink2 } },
    ], { x: x + 0.2, y: y + 0.08, w: 5.75, h: 1.3, fontFace: FONT, valign: 'top' });
  });

  return pptx.write({ outputType: 'nodebuffer' });
}

module.exports = { summarize, renderPdf, renderPptx };
