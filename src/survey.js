// Definición de la encuesta "Tu experiencia Wi-Fi nos importa".
// La calificación inicial (1 a 5 estrellas) decide qué sección se muestra:
//   5 estrellas  -> sección "excelente"  (preguntas 2 a 4)
//   4 estrellas  -> sección "buena"      (preguntas 5 a 9)
//   1-3 estrellas -> sección "problemas" (preguntas 10 a 16)

const EQUIPOS = ['Windows BBVA', 'MacBook BBVA', 'Celular BBVA', 'Tablet BBVA'];
const COLABORADOR = ['Interno', 'Externo'];

const survey = {
  title: 'Tu experiencia Wi-Fi nos importa',
  subtitle: '¡Hagamos la diferencia juntos!',
  rating: {
    id: 'calificacion',
    label: '¿Cómo calificarías tu experiencia con el servicio Wi-Fi hoy?',
    required: true,
  },
  sections: {
    excelente: {
      title: '¡Qué gusto que tu experiencia sea excelente!',
      questions: [
        { id: 'piso', type: 'text', label: '¿En qué piso trabajas actualmente?', required: true },
        { id: 'equipos', type: 'multi', label: '¿Qué tipo de equipo utilizas principalmente para trabajar?', options: EQUIPOS, required: true },
        { id: 'colaborador', type: 'single', label: 'Eres colaborador', options: COLABORADOR, optionLabels: ['Personal interno', 'Personal externo'], required: true },
      ],
    },
    buena: {
      title: 'Ayúdanos a que tu experiencia sea de 5 estrellas',
      questions: [
        {
          id: 'mejoras', type: 'multi', label: '¿Qué aspectos mejorarías de la red Wi-Fi?', required: true, allowOther: true,
          options: ['Mayor velocidad', 'Mayor estabilidad', 'Mejor cobertura / Señal', 'Mejor conexión al Wi-Fi', 'Mejor experiencia en Teams / Videollamada'],
        },
        { id: 'piso', type: 'text', label: '¿En qué piso trabajas actualmente?', required: true },
        { id: 'dispositivo_problema', type: 'multi', label: 'De haber tenido algún inconveniente, ¿en qué tipo de dispositivo presentaste el problema?', options: EQUIPOS, required: false },
        { id: 'colaborador', type: 'single', label: 'Eres colaborador...', options: COLABORADOR, required: true },
        { id: 'comentarios', type: 'textarea', label: '¡Queremos conocer tu opinión!', help: 'Tu retroalimentación nos ayuda a mejorar el servicio Wi-Fi y brindarte una mejor experiencia de conexión. ¡Gracias por compartirla!', required: false },
      ],
    },
    problemas: {
      title: 'Cuéntanos qué está pasando para poder ayudarte',
      questions: [
        {
          id: 'problemas', type: 'multi', label: '¿Cuál es el principal problema que experimentas al utilizar la red Wi-Fi?', required: true, allowOther: true,
          options: ['No logro conectarme al Wi-Fi', 'La conexión estaba lenta', 'Me desconectaba constantemente', 'Las videollamadas se traban o se escucha mal', 'Las páginas o aplicaciones tardan mucho en cargar', 'Pierdo la conexión cuando me muevo de un lugar a otro'],
        },
        { id: 'frecuencia', type: 'single', label: '¿Con qué frecuencia experimentas problemas con la red Wi-Fi?', options: ['Me ocurre frecuentemente', 'Me ocurre ocasionalmente', 'Es la primera vez'], required: true },
        { id: 'piso', type: 'text', label: '¿En qué piso trabajas actualmente?', required: true },
        { id: 'reportado', type: 'single', label: '¿Has reportado estos problemas de conexión Wi-Fi al área de soporte técnico?', options: ['Sí', 'No', 'No sabía cómo reportarlo'], required: true },
        { id: 'equipos', type: 'multi', label: '¿Qué tipo de equipo utilizas principalmente para trabajar?', options: EQUIPOS, required: true },
        { id: 'colaborador', type: 'single', label: 'Eres colaborador...', options: COLABORADOR, required: true },
        { id: 'comentarios', type: 'textarea', label: '¡Queremos conocer tu opinión!', help: 'Tu retroalimentación nos ayuda a mejorar el servicio Wi-Fi y brindarte una mejor experiencia de conexión. ¡Gracias por compartirla!', required: false },
      ],
    },
  },
};

function sectionFor(rating) {
  if (rating === 5) return 'excelente';
  if (rating === 4) return 'buena';
  return 'problemas';
}

const MAX_TEXT = 1000;
// Cómo se respondió: en persona con un encuestador o por cuenta propia (liga / QR).
const CANALES = ['encuestador', 'autoservicio'];

// Valida y normaliza una respuesta enviada por el navegador.
// Devuelve { ok: true, value } o { ok: false, error }.
function validate(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Solicitud inválida.' };
  const rating = Number(body.calificacion);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: 'Selecciona una calificación de 1 a 5 estrellas.' };
  }
  const seccion = sectionFor(rating);
  const answers = {};
  for (const q of survey.sections[seccion].questions) {
    const raw = body[q.id];
    if (q.type === 'text' || q.type === 'textarea') {
      const v = typeof raw === 'string' ? raw.trim().slice(0, MAX_TEXT) : '';
      if (q.required && !v) return { ok: false, error: `Responde: ${q.label}` };
      answers[q.id] = v;
    } else if (q.type === 'single') {
      if (raw === undefined || raw === '' || raw === null) {
        if (q.required) return { ok: false, error: `Responde: ${q.label}` };
        answers[q.id] = '';
      } else if (!q.options.includes(raw)) {
        return { ok: false, error: `Opción no válida en: ${q.label}` };
      } else {
        answers[q.id] = raw;
      }
    } else if (q.type === 'multi') {
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      const picked = [...new Set(list.filter((v) => q.options.includes(v)))];
      let otro = '';
      if (q.allowOther) {
        otro = typeof body[`${q.id}_otro`] === 'string' ? body[`${q.id}_otro`].trim().slice(0, MAX_TEXT) : '';
        answers[`${q.id}_otro`] = otro;
      }
      if (q.required && picked.length === 0 && !otro) return { ok: false, error: `Responde: ${q.label}` };
      answers[q.id] = picked;
    }
  }
  answers.canal = CANALES.includes(body.canal) ? body.canal : 'autoservicio';
  return { ok: true, value: { calificacion: rating, seccion, respuestas: answers } };
}

module.exports = { survey, sectionFor, validate };
