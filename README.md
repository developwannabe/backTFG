# backTFG — Backend EvalFlood4ITS

Backend Node.js/Express del sistema EvalFlood4ITS. Orquesta el pipeline completo de evaluación y cálculo de rutas: recuperación de imágenes de vías, inferencia con IA (visión GPT-4, clasificador Vertex AI, detección YOLO), puntuación mediante lógica difusa, explicabilidad con Grad-CAM y cómputo asíncrono de rutas en un clúster HPC.

## Requisitos

- Node.js >= 18
- Fichero `.env` en la raíz del proyecto (véase Configuración)
- Credenciales de Google Cloud disponibles mediante Application Default Credentials (ADC)
- Acceso a los servicios externos descritos más abajo

## Instalación

```bash
npm install
```

## Ejecución

```bash
# Desarrollo — reinicio automático con nodemon
npm run dev

# Producción
npm start
```

El servidor escucha en el puerto `PORT` (por defecto `3000`).

## Configuración

Crear un fichero `.env` en la raíz del proyecto con las siguientes variables:

| Variable | Descripción |
|---|---|
| `MONGO` | Cadena de conexión a MongoDB Atlas |
| `JWTSECRET` | Clave secreta para la firma de tokens JWT (caducidad 10 h) |
| `PORT` | Puerto del servidor (por defecto 3000) |
| `GPT_URL` | URL base de la Cloud Function `evalFlood` |
| `GPT_TOKEN` | Token Bearer para la Cloud Function |
| `LAMBDA_EVAL` | URL base de la Cloud Function FIS |
| `MAPS_URL` | URL base de la Cloud Function de mapas |
| `YOLO_URL` | URL base del servidor de detección YOLO |
| `SIMULATOR_HOST` | Host del simulador CPN legado (fuera del flujo activo) |
| `MAGNITUDE` | Valor de magnitud del terremoto por defecto (escala interna 0–100) |
| `PROJECT_ID` | ID del proyecto GCP |
| `ENDPOINT_ID` | ID del endpoint de Vertex AI (usado en consultas a Cloud Monitoring/Logging) |
| `MODEL_ENDPOINT` | Nombre completo del recurso del endpoint de Vertex AI (`projects/.../locations/.../endpoints/...`) |

## Estructura del proyecto

```
index.js               Aplicación Express principal y definición de todas las rutas
server/
  sistem.js            Capa de lógica de negocio — operaciones MongoDB y coordinación del pipeline
  cad.js               Capa de acceso a datos — consultas directas a colecciones MongoDB
  utils.js             Middleware de autenticación, helpers de imágenes en GCS y guardas de rol
  passport-config.js   Configuración de Passport: LocalStrategy (bcrypt) y estrategia JWT
nets/                  Ficheros de modelos de red de Petri CPN (referencia legado)
img/                   Imágenes estáticas servidas por el backend
```

## Referencia de la API

### Autenticación

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/iniciarSesion` | — | Login con credenciales; devuelve un token JWT firmado |
| `POST` | `/crearUsuario` | `admin` | Crear una nueva cuenta de usuario |
| `GET` | `/usuarios` | `admin` | Listar todos los usuarios registrados |

### Pipeline de evaluación

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/iniciarEvaluacion/:id` | `evaluador` | Crear o reanudar una sesión de evaluación en MongoDB |
| `GET` | `/evalImage/:idEval/:transicion` | `evaluador` | Recuperar y evaluar la imagen de una transición: visión GPT-4 (profundidad de inundación + severidad de obstáculos) + clasificador Vertex AI + anotación YOLO |
| `POST` | `/evaluarTransicion` | `evaluador` | Guardar los valores manuales de inundación y obstáculos para una transición |
| `GET` | `/transitabilidad/:id/:trn/:val` | `evaluador` | Establecer o sobreescribir la puntuación de transitabilidad manual (0–10) de una transición |
| `GET` | `/fisTransiciones/:idSession` | `evaluador` | Enviar todas las puntuaciones a la Cloud Function FIS y almacenar los costes difusos resultantes |
| `GET` | `/finalizarEvaluacion/:id` | `evaluador` | Marcar una evaluación como finalizada (la hace disponible para el demonio GALGO) |

### Explicabilidad

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/explain/:transicion` | `evaluador` | Descargar la imagen de la transición desde GCS y llamar a Vertex AI con `explain: true`; devuelve `{label, probability, scores, heatmap}` donde `heatmap` es un JPEG Grad-CAM codificado en base64 (224×224 px) |

### Cálculo de rutas

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/ruta/:origen/:destino` | `usuario` | Insertar una petición de ruta en MongoDB y esperar hasta que el demonio GALGO la resuelva (máximo 5 min); devuelve `{mapa, ruta, coste, eta}` donde `eta` es el tiempo de viaje estimado en minutos |

### Monitorización (solo admin)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/metrics` | Logs de predicción de Vertex AI desde Cloud Logging: recuento total, distribución de clases, confianza media, peticiones XAI |
| `GET` | `/api/performance` | Series temporales de Cloud Monitoring: latencia (desde `distributionValue.mean`), peticiones, errores, uso de CPU, número de réplicas |
| `GET` | `/api/torchserve_logs` | Últimas 24 h de logs del endpoint desde Cloud Logging |

### Auxiliares

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/transiciones` | Insertar datos de transiciones de la red viaria (IDs de nodos y tiempos base de recorrido) |
| `GET` | `/image/:type/:img` | Servir imágenes desde GCS (bucket `eval-imgs`): imágenes de vías e imágenes anotadas por YOLO |
| `GET` | `/evaluaciones` | Listar todas las evaluaciones finalizadas |
| `GET` | `/evaluacion/:id` | Recuperar un documento de evaluación completo con el detalle de todas las transiciones |

## Modelo de autenticación

Coexisten dos mecanismos:

- **Basado en sesión** (Passport `LocalStrategy`, contraseñas hasheadas con bcrypt en la colección `usuarios` de MongoDB): usado en el flujo de `/iniciarSesion`.
- **Tokens JWT Bearer** (`passport-jwt`): requeridos en todas las rutas con control de rol mediante `Authorization: Bearer <token>`. Los tokens caducan a las 10 horas.

Roles en orden ascendente de privilegio: `personal`, `evaluador`, `admin`. El rol interno `superUsuario` supera todas las comprobaciones.

