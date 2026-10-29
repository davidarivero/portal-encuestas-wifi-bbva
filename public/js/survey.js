(function () {
  'use strict';

  // Encuesta de una pregunta por pantalla. La definición de las preguntas
  // viene del servidor (/api/encuesta); aquí solo se arma la experiencia.

  const stage = document.getElementById('stage');
  const nav = document.getElementById('nav');
  const backBtn = document.getElementById('back');
  const count = document.getElementById('count');
  const progress = document.getElementById('progress');
  const progressBar = document.getElementById('progress-bar');

  const STAR_PATH = 'M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96z';
  const RATING = {
    1: { text: 'Muy mala', face: '😣' },
    2: { text: 'Mala', face: '🙁' },
    3: { text: 'Regular', face: '😐' },
    4: { text: 'Buena', face: '🙂' },
    5: { text: 'Excelente', face: '🤩' },
  };
  const KEYS = 'ABCDEFGHIJ';
  const ADVANCE_MS = 420;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // En /encuestador la encuesta la aplica un encuestador en persona y se muestra la guía de speech.
  const surveyor = location.pathname.replace(/\/+$/, '') === '/encuestador';

  let survey = null;
  let answers = {};
  let index = 0; // 0 = bienvenida, 1 = calificación, 2.. = preguntas de la sección
  let card = null;
  let busy = false;
  let advanceTimer = null;

  // ---------- utilidades ----------
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined) continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children || [])) if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return node;
  }
  function svg(d, cls) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    s.appendChild(p);
    return s;
  }
  const sectionFor = (r) => (r === 5 ? 'excelente' : r === 4 ? 'buena' : 'problemas');
  const questions = () => (answers.calificacion ? survey.sections[sectionFor(answers.calificacion)].questions : []);
  const totalSteps = () => 1 + questions().length;
  const isLast = () => !!answers.calificacion && index === totalSteps();
  const currentQuestion = () => questions()[index - 2];

  function isAnswered(q) {
    const v = answers[q.id];
    if (q.type === 'multi') return (Array.isArray(v) && v.length > 0) || !!(q.allowOther && answers[`${q.id}_otro`]);
    return typeof v === 'string' && v.trim() !== '';
  }

  // ---------- navegación ----------
  function go(next, dir) {
    clearTimeout(advanceTimer);
    index = next;
    render(dir);
  }
  function forward() {
    if (busy) return;
    if (index === 1 && !answers.calificacion) return complain('Elige una calificación de 1 a 5 estrellas.');
    if (index >= 2) {
      const q = currentQuestion();
      if (q.required && !isAnswered(q)) return complain(q.type === 'multi' ? 'Elige al menos una opción.' : 'Esta pregunta es obligatoria.');
    }
    if (isLast()) return submit();
    go(index + 1, 'fwd');
  }
  function backward() {
    if (busy || index <= 1) return;
    go(index - 1, 'back');
  }
  function scheduleAdvance() {
    clearTimeout(advanceTimer);
    if (isLast()) return; // en la última pregunta se envía con el botón
    advanceTimer = setTimeout(forward, ADVANCE_MS);
  }

  function complain(message) {
    const box = card.querySelector('.sv-error');
    box.textContent = message;
    box.classList.add('show');
    card.classList.remove('sv-shake');
    void card.offsetWidth;
    card.classList.add('sv-shake');
  }

  function updateChrome() {
    const inQuestions = index >= 1;
    nav.classList.toggle('hidden', !inQuestions);
    progress.classList.toggle('hidden', !inQuestions);
    backBtn.disabled = index <= 1;
    if (!inQuestions) return;
    const total = answers.calificacion ? totalSteps() : null;
    count.textContent = total ? `Pregunta ${index} de ${total}` : 'Pregunta 1';
    const pct = total ? Math.round(((index - 1) / total) * 100) : 0;
    progressBar.style.width = `${Math.max(pct, 3)}%`;
    progress.setAttribute('aria-valuenow', String(pct));
  }

  function mount(node, dir) {
    const old = card;
    card = node;
    node.classList.add(dir === 'back' ? 'sv-enter-back' : 'sv-enter');
    if (old) {
      old.classList.add(dir === 'back' ? 'sv-leave-back' : 'sv-leave');
      old.setAttribute('aria-hidden', 'true');
      setTimeout(() => old.remove(), reduceMotion ? 0 : 320);
    }
    stage.appendChild(node);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      node.classList.remove('sv-enter', 'sv-enter-back');
      const focusable = node.querySelector('[data-autofocus]') || node.querySelector('input, textarea, button.sv-opt, button.sv-star, button.sv-primary');
      if (focusable) focusable.focus({ preventScroll: true });
    }));
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  function render(dir) {
    updateChrome();
    setSpeechStage(index === 0 ? 'inicio' : 'acepta');
    if (index === 0) return mount(renderWelcome(), dir);
    if (index === 1) return mount(renderRating(), dir);
    mount(renderQuestion(currentQuestion()), dir);
  }

  // ---------- pantallas ----------
  function shell(children, extraClass) {
    return el('section', { class: `sv-card ${extraClass || ''}` }, [...children, el('div', { class: 'sv-error', role: 'alert' })]);
  }

  function heading(number, q) {
    const nodes = [];
    if (number) nodes.push(el('div', { class: 'sv-qnum' }, [String(number), svg('M5 12h14M13 6l6 6-6 6', 'sv-arrow')]));
    const h = el('h2', { class: 'sv-qtitle', id: 'sv-q', text: q.label });
    if (q.required) h.appendChild(el('span', { class: 'sv-req', 'aria-label': 'obligatoria', text: ' *' }));
    nodes.push(h);
    if (q.help) nodes.push(el('p', { class: 'sv-help', text: q.help }));
    return nodes;
  }

  function actions({ label, optional }) {
    const last = isLast();
    const btn = el('button', { type: 'button', class: 'sv-primary', onclick: forward }, [
      el('span', { text: label || (last ? 'Enviar respuestas' : 'Continuar') }),
      svg(last ? 'M5 12.5l4.5 4.5L19 7.5' : 'M5 12h14M13 6l6 6-6 6'),
    ]);
    const hint = el('span', { class: 'sv-hint' }, optional ? 'Opcional' : ['o presiona ', el('kbd', { text: 'Enter ↵' })]);
    return el('div', { class: 'sv-actions' }, [btn, hint]);
  }

  function renderWelcome() {
    return shell([
      el('div', { class: 'sv-wifi', 'aria-hidden': 'true' }, [el('span'), el('span'), el('span'), el('i')]),
      el('h1', { class: 'sv-welcome-title', text: survey.title }),
      el('p', { class: 'sv-welcome-sub', text: survey.subtitle }),
      el('p', { class: 'sv-welcome-text', text: 'Ayúdanos a mejorar la red Wi-Fi de tu edificio. Son unas cuantas preguntas y es completamente anónima.' }),
      surveyor ? el('p', { class: 'sv-mode-chip', text: 'Modo encuestador' }) : null,
      el('ul', { class: 'sv-facts' }, [
        el('li', {}, [svg('M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'), 'Menos de 2 minutos']),
        el('li', {}, [svg('M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z'), 'Anónima']),
      ]),
      el('div', { class: 'sv-actions center' }, [
        el('button', { type: 'button', class: 'sv-primary sv-big', 'data-autofocus': '', onclick: () => go(1, 'fwd') }, [el('span', { text: 'Comenzar' }), svg('M5 12h14M13 6l6 6-6 6')]),
      ]),
    ], 'sv-welcome');
  }

  function renderRating() {
    const q = survey.rating;
    const face = el('div', { class: 'sv-face', 'aria-hidden': 'true', text: answers.calificacion ? RATING[answers.calificacion].face : '🤔' });
    const label = el('div', { class: 'sv-rating-label', text: answers.calificacion ? RATING[answers.calificacion].text : 'Elige de 1 a 5 estrellas' });
    const row = el('div', { class: 'sv-stars', role: 'radiogroup', 'aria-labelledby': 'sv-q' });

    const paint = (n, preview) => {
      row.querySelectorAll('.sv-star').forEach((s, i) => s.classList.toggle('on', i < n));
      face.textContent = n ? RATING[n].face : '🤔';
      label.textContent = n ? RATING[n].text : 'Elige de 1 a 5 estrellas';
      label.classList.toggle('preview', !!preview);
    };
    const choose = (n) => {
      const changed = answers.calificacion && sectionFor(answers.calificacion) !== sectionFor(n);
      if (changed) {
        // Las preguntas de otra sección dejan de aplicar.
        answers = { calificacion: n };
      }
      answers.calificacion = n;
      paint(n);
      row.querySelectorAll('.sv-star').forEach((s, i) => {
        s.setAttribute('aria-checked', String(i + 1 === n));
        s.tabIndex = i + 1 === n ? 0 : -1;
        s.classList.toggle('pop', i < n);
        if (i < n) s.style.animationDelay = `${i * 50}ms`;
      });
      face.classList.remove('bounce'); void face.offsetWidth; face.classList.add('bounce');
      card.querySelector('.sv-error').classList.remove('show');
      updateChrome();
      scheduleAdvance();
    };

    for (let i = 1; i <= 5; i++) {
      const current = answers.calificacion === i;
      const star = el('button', {
        type: 'button', class: 'sv-star', role: 'radio', 'aria-checked': String(current), 'aria-label': `${i} de 5: ${RATING[i].text}`,
        tabindex: current || (!answers.calificacion && i === 1) ? '0' : '-1',
        onclick: () => choose(i),
        onmouseenter: () => paint(i, true),
        onmouseleave: () => paint(answers.calificacion || 0),
        onkeydown: (e) => {
          const cur = answers.calificacion || 0;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); const n = Math.min(5, cur + 1); choose(n); row.children[n - 1].focus(); }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); const n = Math.max(1, cur - 1); choose(n); row.children[n - 1].focus(); }
        },
      }, [svg(STAR_PATH), el('span', { class: 'sv-star-n', text: String(i) })]);
      row.appendChild(star);
    }
    const node = shell([...heading(1, q), face, row, label, actions({})], 'sv-rating');
    requestAnimationFrame(() => paint(answers.calificacion || 0));
    return node;
  }

  function renderQuestion(q) {
    const number = index;
    let body;
    if (q.type === 'text') body = renderText(q);
    else if (q.type === 'textarea') body = renderTextarea(q);
    else body = renderChoices(q);
    return shell([...heading(number, q), ...[].concat(body), actions({ optional: !q.required })], `sv-type-${q.type}`);
  }

  function renderText(q) {
    const input = el('input', {
      type: 'text', class: 'sv-input', name: q.id, maxlength: '100', autocomplete: 'off', 'aria-labelledby': 'sv-q',
      placeholder: 'Ej. Piso 12', value: answers[q.id] || '',
      oninput: (e) => { answers[q.id] = e.target.value; card.querySelector('.sv-error').classList.remove('show'); },
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); forward(); } },
    });
    return input;
  }

  function renderTextarea(q) {
    const max = 1000;
    const counter = el('div', { class: 'sv-counter', text: `${(answers[q.id] || '').length}/${max}` });
    const ta = el('textarea', {
      class: 'sv-input sv-textarea', name: q.id, maxlength: String(max), 'aria-labelledby': 'sv-q',
      placeholder: 'Escribe aquí tus comentarios…',
      oninput: (e) => { answers[q.id] = e.target.value; counter.textContent = `${e.target.value.length}/${max}`; },
      onkeydown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); forward(); } },
    });
    ta.value = answers[q.id] || '';
    return [ta, counter];
  }

  function renderChoices(q) {
    const multi = q.type === 'multi';
    if (multi && !Array.isArray(answers[q.id])) answers[q.id] = [];
    const list = el('div', { class: 'sv-options', role: multi ? 'group' : 'radiogroup', 'aria-labelledby': 'sv-q' });
    const hint = el('p', { class: 'sv-sub', text: multi ? 'Selecciona todas las que correspondan.' : 'Elige una opción.' });

    const refresh = () => {
      list.querySelectorAll('.sv-opt[data-value]').forEach((b) => {
        const v = b.dataset.value;
        const on = multi ? answers[q.id].includes(v) : answers[q.id] === v;
        b.classList.toggle('selected', on);
        b.setAttribute(multi ? 'aria-pressed' : 'aria-checked', String(on));
      });
      card && card.querySelector('.sv-error').classList.remove('show');
    };

    const toggle = (v, btn) => {
      if (multi) {
        const set = answers[q.id];
        const i = set.indexOf(v);
        if (i >= 0) set.splice(i, 1); else set.push(v);
      } else {
        answers[q.id] = v;
      }
      refresh();
      btn.classList.remove('flash'); void btn.offsetWidth; btn.classList.add('flash');
      if (!multi) scheduleAdvance();
    };

    q.options.forEach((v, i) => {
      const btn = el('button', {
        type: 'button', class: 'sv-opt', 'data-value': v, 'data-key': KEYS[i],
        role: multi ? undefined : 'radio',
      }, [
        el('span', { class: 'sv-key', text: KEYS[i] }),
        el('span', { class: 'sv-opt-text', text: (q.optionLabels && q.optionLabels[i]) || v }),
        el('span', { class: 'sv-check' }, svg('M5 12.5l4.5 4.5L19 7.5')),
      ]);
      btn.style.animationDelay = `${60 + i * 45}ms`;
      btn.addEventListener('click', () => toggle(v, btn));
      list.appendChild(btn);
    });

    if (q.allowOther) {
      const key = KEYS[q.options.length];
      const otherKey = `${q.id}_otro`;
      const input = el('input', {
        type: 'text', class: 'sv-other-input', maxlength: '300', placeholder: 'Escribe cuál…', 'aria-label': 'Otro, especifica',
        value: answers[otherKey] || '',
        oninput: (e) => { answers[otherKey] = e.target.value.trim(); wrap.classList.toggle('selected', !!answers[otherKey]); card.querySelector('.sv-error').classList.remove('show'); },
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); forward(); } e.stopPropagation(); },
      });
      const wrap = el('div', { class: `sv-opt sv-other ${answers[otherKey] ? 'selected open' : ''}`, 'data-key': key }, [
        el('span', { class: 'sv-key', text: key }),
        el('span', { class: 'sv-opt-text', text: 'Otro' }),
        input,
      ]);
      wrap.style.animationDelay = `${60 + q.options.length * 45}ms`;
      wrap.addEventListener('click', () => { wrap.classList.add('open'); input.focus(); });
      list.appendChild(wrap);
    }

    requestAnimationFrame(refresh);
    return [hint, list];
  }

  // ---------- envío ----------
  async function submit() {
    busy = true;
    const btn = card.querySelector('.sv-primary');
    btn.disabled = true;
    btn.classList.add('loading');
    btn.querySelector('span').textContent = 'Enviando…';

    const payload = { calificacion: answers.calificacion, canal: surveyor ? 'encuestador' : 'autoservicio' };
    for (const q of questions()) {
      payload[q.id] = answers[q.id] ?? (q.type === 'multi' ? [] : '');
      if (q.allowOther) payload[`${q.id}_otro`] = answers[`${q.id}_otro`] || '';
    }
    try {
      const res = await fetch('/api/respuestas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || (res.status === 429 ? 'Demasiados envíos. Espera un momento e intenta de nuevo.' : 'No se pudo enviar. Intenta de nuevo.'));
      }
      showThanks();
    } catch (err) {
      busy = false;
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.querySelector('span').textContent = 'Enviar respuestas';
      complain(err.message);
    }
  }

  function showThanks() {
    busy = false;
    setSpeechStage('cierre');
    nav.classList.add('hidden');
    progressBar.style.width = '100%';
    const r = answers.calificacion;
    const message = r === 5
      ? '¡Qué gusto que tu conexión sea excelente! Seguiremos trabajando para mantenerla así.'
      : r === 4
        ? 'Tomaremos en cuenta tus sugerencias para llevar tu experiencia a 5 estrellas.'
        : 'Lamentamos los inconvenientes. Tu reporte nos ayuda a identificar y resolver los problemas de la red.';
    const confetti = el('div', { class: 'sv-confetti', 'aria-hidden': 'true' });
    if (!reduceMotion) {
      const colors = ['#001391', '#85c8ff', '#2dcccd', '#f8cd51', '#1973b8'];
      for (let i = 0; i < 28; i++) {
        const c = el('i');
        c.style.left = `${Math.random() * 100}%`;
        c.style.background = colors[i % colors.length];
        c.style.animationDelay = `${Math.random() * 0.4}s`;
        c.style.animationDuration = `${1.2 + Math.random() * 1}s`;
        c.style.transform = `rotate(${Math.random() * 360}deg)`;
        confetti.appendChild(c);
      }
    }
    const node = shell([
      confetti,
      el('div', { class: 'sv-done' }, svg('M5 12.5l4.5 4.5L19 7.5')),
      el('h2', { class: 'sv-thanks-title', text: '¡Gracias por tu participación!' }),
      el('p', { class: 'sv-thanks-text', text: message }),
      el('div', { class: 'sv-actions center' }, [
        el('button', { type: 'button', class: 'sv-secondary', onclick: restart }, surveyor ? 'Iniciar nueva encuesta' : 'Responder otra encuesta'),
      ]),
      el('figure', { class: 'sv-postal' }, [
        el('img', { src: '/img/postal-wifi-bbva.jpg', alt: 'Postal BBVA: Tu experiencia Wi-Fi nos importa. Recomendaciones: usa el Portal HPD Wi-Fi BBVA, no uses tu móvil como hotspot en sedes corporativas y haz un uso responsable de la red. En caso de falla, registra tu incidencia en Service Now.', width: '1184', height: '1705', loading: 'lazy' }),
      ]),
    ], 'sv-thanks');
    mount(node, 'fwd');
    setTimeout(() => progress.classList.add('hidden'), 900);
  }

  function restart() {
    answers = {};
    go(0, 'back');
  }

  // ---------- guía de speech ----------
  const speech = document.getElementById('speech');
  const speechToggle = document.getElementById('speech-toggle');
  const wide = window.matchMedia('(min-width: 1100px)');

  function setSpeechOpen(open) {
    document.body.classList.toggle('sv-speech-open', open);
    speechToggle.setAttribute('aria-expanded', String(open));
  }
  function setSpeechStage(stageName) {
    if (!surveyor) return;
    speech.querySelectorAll('.sv-speech-block').forEach((b) => {
      const on = b.dataset.stage === stageName || (stageName === 'inicio' && b.dataset.stage === 'ocupado');
      b.classList.toggle('current', on);
    });
    const first = speech.querySelector(`.sv-speech-block[data-stage="${stageName}"]`);
    if (first && document.body.classList.contains('sv-speech-open')) first.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  if (surveyor) {
    document.body.classList.add('sv-surveyor');
    document.title = 'Encuestador | Encuesta Wi-Fi BBVA';
    speech.classList.remove('hidden');
    speechToggle.classList.remove('hidden');
    setSpeechOpen(wide.matches);
    speechToggle.addEventListener('click', () => setSpeechOpen(!document.body.classList.contains('sv-speech-open')));
    document.getElementById('speech-close').addEventListener('click', () => setSpeechOpen(false));
  }

  // ---------- teclado ----------
  document.addEventListener('keydown', (e) => {
    if (!card || busy || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || (tag === 'input' && e.target.type === 'text')) return;
    if (index === 1 && /^[1-5]$/.test(e.key)) {
      const star = card.querySelectorAll('.sv-star')[Number(e.key) - 1];
      if (star) { star.click(); star.focus(); }
      return;
    }
    if (index >= 2 && /^[a-j]$/i.test(e.key)) {
      const opt = card.querySelector(`.sv-opt[data-key="${e.key.toUpperCase()}"]`);
      if (opt) { e.preventDefault(); opt.click(); }
      return;
    }
    // En selección múltiple Enter avanza; la barra espaciadora marca la opción.
    const multiOpt = index >= 2 && currentQuestion().type === 'multi' && e.target.classList && e.target.classList.contains('sv-opt');
    if (e.key === 'Enter' && index >= 1 && (tag !== 'button' || multiOpt)) { e.preventDefault(); forward(); }
  });
  backBtn.addEventListener('click', backward);

  // ---------- inicio ----------
  fetch('/api/encuesta')
    .then((r) => r.json())
    .then((s) => { survey = s; render('fwd'); })
    .catch(() => {
      stage.appendChild(el('section', { class: 'sv-card' }, el('p', { class: 'sv-error show', text: 'No se pudo cargar la encuesta. Recarga la página.' })));
    });
})();
