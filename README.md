# Portal de encuestas Wi-Fi BBVA

Portal independiente para la encuesta **"Tu experiencia Wi-Fi nos importa: ¡Hagamos la diferencia juntos!"**, con:

- **Encuesta pública interactiva** en `/` (sin login, anónima, adaptada a celular): una pregunta por pantalla, barra de progreso, animaciones, avance automático al elegir y atajos de teclado (1–5 para las estrellas, letras para las opciones, Enter para continuar).
- **Panel de resultados** en `/admin` con acceso propio para dos usuarios: `david.rivero` y `luisoctavio.rubio`.
- Indicadores, gráficas por pregunta, comentarios, tabla de detalle, filtro por fechas y exportación a CSV (Excel).

## Modo encuestador y postal

- **`/encuestador`**: la misma encuesta, con la **guía de speech** para el encuestador en un panel lateral (en celular se abre con el botón "Guía de speech"). El panel resalta el guion que corresponde a cada momento: presentación al inicio, "si el usuario acepta" durante las preguntas y cierre al terminar. Incluye las recomendaciones para los becarios.
- Cada respuesta guarda su **canal** (`encuestador` o `autoservicio`) y el panel de resultados lo muestra en una gráfica, en la tabla y en el CSV.
- Al terminar la encuesta se muestra la **postal Wi-Fi BBVA** (`public/img/postal-wifi-bbva.jpg`) con las recomendaciones de uso de la red.

## Lógica de la encuesta

La primera pregunta (1 a 5 estrellas) decide qué preguntas siguen, igual que el formulario original:

| Calificación | Sección | Preguntas |
|---|---|---|
| 5★ | Excelente | Piso, equipo de trabajo, tipo de colaborador |
| 4★ | Buena | Aspectos a mejorar (+ otro), piso, dispositivo con problema, colaborador, comentarios |
| 1–3★ | Con problemas | Problema principal (+ otro), frecuencia, piso, ¿reportado a soporte?, equipo, colaborador, comentarios |

Las preguntas están en `src/survey.js`; ahí se cambian textos u opciones.

## Estructura

```
src/server.js     Servidor Express (rutas públicas y de administración)
src/survey.js     Definición y validación de la encuesta
src/auth.js       Usuarios administradores
src/db.js         PostgreSQL (producción) o archivo JSON (desarrollo)
public/           Encuesta, estilos, scripts y logotipos
views/            Login, panel de resultados y página 404
render.yaml       Blueprint de Render (servicio web + base de datos)
```

## Ejecutar en local

Requiere Node.js 22 o superior.

```bash
npm install
cp .env.example .env      # y escribe las contraseñas
npm run dev
```

Abre http://localhost:3000 (encuesta) y http://localhost:3000/admin (panel). Sin `DATABASE_URL`, las respuestas se guardan en `data/respuestas.json`.

Pruebas: `npm test`.

## Subir a GitHub

```bash
git remote add origin https://github.com/<tu-usuario>/portal-encuestas-wifi-bbva.git
git push -u origin main
```

El archivo `.env` está en `.gitignore`: **las contraseñas nunca se suben al repositorio**.

## Desplegar en Render

1. En Render: **New → Blueprint** y elige el repositorio. Render lee `render.yaml` y crea:
   - el servicio web `encuesta-wifi-bbva`;
   - la base de datos PostgreSQL `encuesta-wifi-bbva-db` (la tabla se crea sola al arrancar).
2. Render pedirá los valores de `PASSWORD_DAVID_RIVERO` y `PASSWORD_LUISOCTAVIO_RUBIO`. Escribe las contraseñas iniciales.
3. `SESSION_SECRET` se genera automáticamente.
4. Al terminar, la encuesta queda en `https://<servicio>.onrender.com/` y el panel en `/admin`.

> **Importante sobre el plan gratuito:** la base de datos gratuita de Render expira a los 30 días y el servicio web gratuito se duerme tras 15 minutos sin uso (la primera visita tarda ~1 minuto). Para una encuesta en producción cambia `plan: free` por un plan de pago en `render.yaml` (por ejemplo `basic-256mb` para la base de datos y `starter` para el servicio web), o hazlo desde el panel de Render. Descarga el CSV antes de que expire una base gratuita.

## Usuarios y contraseñas

| Usuario | Variable de entorno |
|---|---|
| `david.rivero` | `PASSWORD_DAVID_RIVERO` |
| `luisoctavio.rubio` | `PASSWORD_LUISOCTAVIO_RUBIO` |

**Cambiar una contraseña:** en Render abre el servicio → **Environment** → edita la variable → **Save Changes**. Render redespliega y la nueva contraseña aplica de inmediato. Si una variable está vacía, ese usuario no puede entrar.

**Cerrar todas las sesiones abiertas:** cambia el valor de `SESSION_SECRET` (Render → Environment → Generate). Las sesiones duran 8 horas.

Seguridad incluida: cookies de sesión firmadas (`HttpOnly`, `Secure`, `SameSite`), límite de intentos de login (10 cada 15 min), límite de envíos de la encuesta, cabeceras de seguridad (Helmet/CSP) y protección contra inyección de fórmulas en el CSV.

## Marca

- Colores en `public/css/styles.css` (variables `--bbva-*`): azul BBVA `#001391`, marino `#070E46`, core `#004481`, medio `#1973B8`, claro `#85C8FF`, aqua `#2DCCCD`.
- El logotipo BBVA está en `public/img/bbva-logo.png` (blanco) y `public/img/bbva-logo-azul.png` (azul), tomado de la postal oficial. Si tienes el archivo vectorial oficial, puedes reemplazarlos conservando el nombre.
- No contiene logotipos de terceros.
