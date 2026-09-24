# Guía del proyecto híbrido de pruebas (API + UI + Allure)

Este documento explica cómo está armado el proyecto, cómo ejecutarlo, y todo lo
que hay que tener en cuenta para seguir agregando pruebas sin romper el reporte
consolidado. Está pensado para que cualquier persona (incluida tu yo del
futuro) pueda retomarlo sin contexto previo.

## 1. Qué es este proyecto

Es un framework **híbrido** de automatización de pruebas:

- **API**: colección de Postman (`newman` como runner) contra la API pública
  de demo [Petstore Swagger](https://petstore.swagger.io/v2).
- **UI**: specs de **Playwright Test**.
- **Reporte**: ambos tipos de prueba escriben sus resultados en el **mismo
  formato y carpeta** (`allure-results/`), y se combinan en **un solo reporte
  Allure** (`allure-report/`). No hay dos reportes separados: hay uno solo que
  mezcla suites de API y de UI.

```
tests/
  api/
    Tienda_mascotas.postman_collection.json   # colección Postman/Newman
    Libros_favoritos.postman_collection.json  # otra colección independiente
  ui/
    example.spec.js                           # specs de Playwright
```

### Cómo agregar una colección de Postman nueva

`npm run test:api` **no apunta a un archivo fijo**: ejecuta
`scripts/run-api-tests.js`, que escanea `tests/api/` y corre con Newman
**todo archivo que termine en `.postman_collection.json`**, uno por uno, en
orden alfabético, volcando todos los resultados al mismo `allure-results/`.

Para agregar una colección nueva:

1. Exportala desde Postman como Collection v2.1 y guardala en
   `tests/api/<nombre>.postman_collection.json`.
2. (Opcional) si necesita variables de entorno propias, exportá también el
   Environment como `tests/api/<mismo-nombre>.postman_environment.json` — el
   script detecta automáticamente el environment que **coincida en el nombre
   base** con la colección y se lo pasa a Newman con `-e`. Si no hay archivo
   de environment con ese nombre, simplemente corre sin `-e` (como hoy).
3. Nada más. No hace falta tocar `package.json` ni ningún script: la próxima
   vez que corras `npm run test:api` o `npm run test:all`, la colección nueva
   se ejecuta junto con las demás y aparece en el mismo reporte Allure.

Si una colección nueva falla, el script sigue corriendo las demás colecciones
(no corta en el primer error) y al final termina con código de salida
distinto de cero si alguna falló, igual que hace `test:all` a nivel general.

## 2. Cómo se logra el reporte consolidado

La clave es que **dos reporters distintos escriben al mismo directorio**:

- `newman-reporter-allure` (usado por el script `test:api`) exporta a
  `./allure-results` por defecto.
- `allure-playwright` (configurado en `playwright.config.js`) también escribe
  en `./allure-results` (`resultsDir: 'allure-results'`).

Como Allure identifica cada caso por sus propios archivos `*-result.json`, no
importa si vienen de Newman o de Playwright: al correr `allure generate
allure-results -o allure-report` se genera **un único árbol de suites** con
ambos orígenes. Lo verificamos manualmente: tras correr todo, `allure-results`
contenía los 12 requests de la colección Postman + los 6 tests de Playwright
(x3 navegadores), y el reporte final los mostraba juntos.

**Importante:** si en el futuro cambias `resultsDir` en `playwright.config.js`
o el flag `--reporter-allure-export` en el script `test:api`, ambos deben
seguir apuntando a la **misma carpeta**, o el reporte dejará de ser
consolidado (tendrías dos reportes separados).

## 3. Scripts disponibles (`package.json`)

| Script | Qué hace |
|---|---|
| `npm run test:api` | Corre **todas** las colecciones Postman encontradas en `tests/api/` con Newman (ver sección "Cómo agregar una colección de Postman nueva"), resultados a `allure-results/` **y** a `reports/api-report/*.html` (un HTML legible por colección, más un `index.html` que las enlaza). |
| `npm run test:ui` | Corre los specs de Playwright (`tests/ui`), resultados a `allure-results/`. |
| `npm run test:ui:headed` | Igual, pero con navegador visible (debug local). |
| `npm run test:all` | Pipeline completo: limpia → API → UI → genera reporte. Sigue corriendo aunque una suite falle (usa `run-s -c`), y termina con código de salida distinto de cero si algo falló, para que un CI lo detecte. |
| `npm run clean:allure` | Borra `allure-results/` y `allure-report/` (empezar de cero). |
| `npm run report:generate` | Genera el HTML final en `allure-report/` a partir de `allure-results/`. |
| `npm run report:open` | Sirve y abre `allure-report/` en el navegador. |
| `npm run report` | `report:generate` + `report:open` en un solo paso. |
| `npm test` | Alias de `test:all`. |
| `npm run playwright:install` | Instala los navegadores de Playwright (Chromium/Firefox/WebKit) y sus dependencias del SO. Ejecutar una sola vez por máquina/CI. |

### Flujo típico del día a día

```bash
npm install                # una sola vez, o cuando cambien dependencias
npm run playwright:install # una sola vez por máquina
npm run test:all           # corre todo y deja el reporte listo
npm run report:open        # lo abre en el navegador
```

## 4. Qué se configuró / corrigió en esta sesión

El proyecto tenía las dependencias instaladas pero **cero scripts y cero
configuración de Allure**. Esto es lo que se ajustó:

1. **`package.json`**
   - Se agregaron todos los scripts de la tabla anterior (no existía ninguno).
   - Se movió `allure` de `dependencies` a `devDependencies` (es una
     herramienta de testing, no algo que se necesite en runtime de producción).
   - Se agregaron `rimraf` (borrado de carpetas multiplataforma) y
     `npm-run-all2` (para encadenar scripts con `-c`/continue-on-error, de
     forma que el reporte se genere incluso si una suite falla).
2. **`playwright.config.js`**
   - `testDir` pasó de `./tests` a `./tests/ui`, para que Playwright no
     intente escanear la carpeta `tests/api` (donde solo hay un JSON de
     Postman, no specs).
   - Se agregó el reporter `allure-playwright` apuntando a `allure-results`,
     manteniendo `list` y `html` para depuración local rápida.
3. **`.gitignore`**
   - Se agregaron `/allure-results/`, `/allure-report/`, `/newman/` (no se
     versionan reportes generados) y `.env*` (por si en el futuro se
     necesitan credenciales o URLs por entorno).
4. Se validó **de punta a punta**: se corrió `npm run test:all` con todo en
   verde (58 asserts de API + 6 tests de UI), y se forzó un fallo intencional
   en un test de UI para confirmar que el reporte se sigue generando y que el
   comando termina con exit code `1` (para que un pipeline de CI lo marque
   como fallido).
5. **`scripts/run-api-tests.js`** (agregado luego, al sumar una segunda
   colección): reemplaza el comando fijo de Newman por un script que
   descubre automáticamente todas las colecciones en `tests/api/` y las
   corre una por una — ver "Cómo agregar una colección de Postman nueva"
   arriba. Internamente invoca el binario de Newman con `node` en vez de con
   una shell, porque la ruta del proyecto tiene espacios
   (`Proyecto demo hbrido practica`) y correrlo vía `shell: true` rompía el
   citado de argumentos (`ENOENT` cortando la ruta en el primer espacio).
6. **`newman-reporter-htmlextra`** (agregado al ajustar el `Jenkinsfile`): cada
   colección ahora también genera un reporte HTML propio en
   `reports/api-report/<nombre-de-la-colección>.html`, más un `index.html`
   que enlaza a todos. Esto es un artefacto **secundario** legible por
   humanos sin abrir Allure; el reporte consolidado que combina todo sigue
   siendo Allure (`allure-results` / `allure-report`).

## 5. Cosas a tener en cuenta al seguir agregando pruebas

### API (Postman/Newman)

- La colección actual **hardcodea la URL base** (`https://petstore.swagger.io/v2`)
  y algunos identificadores dentro de cada request. Si en algún momento se
  apunta a otro entorno (staging, local, etc.), conviene:
  - Crear un **Postman Environment** (`tests/api/*.postman_environment.json`)
    con una variable `baseUrl`, y reemplazar las URLs hardcodeadas por
    `{{baseUrl}}/...`.
  - Pasarlo al correr Newman con `-e tests/api/<archivo>.postman_environment.json`.
- Hay requests que dependen de **nombres/IDs fijos en vez de variables
  encadenadas**, por ejemplo:
  - `Traer usuario`, `Actualizar datos usuario` y `Borrar usuario` apuntan a
    rutas literales (`/user/Usuario 1`, `/user/Prueba 2 Editar`) en vez de
    usar el username devuelto por el request que crea el usuario.
  - `Mostrar mascota` y `Delete data` usan el id `10` fijo en vez de la
    variable de colección `petId` que sí se guarda en `Agregar mascota`.
  - Esto **no rompe nada hoy** porque la API pública de Petstore acepta y
    reutiliza esos datos de ejemplo, pero es frágil: si esos recursos de
    ejemplo cambian o se corre en paralelo contra un backend real, los tests
    pueden empezar a fallar por datos que no existen. Recomendado: encadenar
    con `pm.collectionVariables.set(...)` como ya se hace con `petId` y
    `orderId`, y usarlas en la URL (`/pet/{{petId}}`, `/user/{{username}}`).
- Cada request nuevo debería seguir el patrón que ya usa la colección: validar
  status code, tiempo de respuesta, `Content-Type`, y forma del schema de
  respuesta.
- Para que el reporte de Allure quede mejor organizado (epics/features/tags),
  se pueden anotar los tests de Postman con comentarios especiales, por
  ejemplo:
  ```js
  // @allure.label.epic:Tienda de mascotas
  // @allure.label.feature:Usuarios
  // @allure.label.tag:api
  pm.test("Status code is 200", function () { ... });
  ```
  (ver [documentación de newman-reporter-allure](https://allurereport.org/docs/newman-reference/)).

### UI (Playwright)

- Hoy solo existe `tests/ui/example.spec.js`, que es el spec de ejemplo por
  defecto de Playwright (apunta a `playwright.dev`, no a una app propia).
  **Reemplazarlo o borrarlo** en cuanto haya specs reales del proyecto, para
  que no quede como "ruido" en el reporte.
- Al crear specs nuevos:
  - Usar `test.describe()` para agrupar por feature (esos grupos se ven como
    "suites" en Allure).
  - Si se quiere organizar mejor, considerar un patrón **Page Object Model**
    (`tests/ui/pages/`) a medida que crezca el número de specs.
  - Usar `test.step()` de Playwright para pasos intermedios: `allure-playwright`
    los traduce automáticamente en steps dentro del reporte.
  - Si una página real requiere login o URL base, definir `use.baseURL` en
    `playwright.config.js` en vez de hardcodear URLs en cada spec.
- Los 3 proyectos de navegador (chromium/firefox/webkit) están habilitados;
  cada spec corre triplicado. Si el equipo no necesita los tres navegadores
  desde el día uno, se puede comentar alguno en `playwright.config.js` para
  acelerar la ejecución local.

### Reporte Allure

- El reporte se regenera desde cero cada vez que corre `test:all`
  (`clean:allure` borra `allure-results` y `allure-report` antes de correr
  nada). Esto significa que **no hay gráfico de tendencia histórica
  (`trend`)** entre ejecuciones todavía, porque cada corrida empieza limpia.
  Si más adelante se quiere ese historial, Allure lo soporta copiando la
  carpeta `allure-report/history` hacia `allure-results/history` **antes** de
  generar el siguiente reporte (y sin borrar `allure-report` antes de hacerlo).
  Se dejó fuera de este setup a propósito para no complicar el pipeline base;
  ver la guía oficial: https://allurereport.org/docs/history/.
- `allure-report/` y `allure-results/` están en `.gitignore`: son artefactos
  generados, no se versionan. Si se quiere publicar el reporte (por ejemplo en
  GitHub Pages o como artefacto de CI), hay que hacerlo como parte del pipeline
  de CI, no commiteando la carpeta.
- La CLI usada es **Allure Report 3** (paquete `allure`, no el clásico
  `allure-commandline` de Java). Su sintaxis difiere un poco de Allure 2: por
  ejemplo, `allure generate` en v3 **no acepta `--clean`** (si se agrega,
  falla con "Unknown Syntax Error"). Como el pipeline ya borra `allure-report`
  antes de generar (vía `clean:allure`), no hace falta ese flag.

## 6. Prerrequisitos para correr el proyecto en una máquina nueva

1. Node.js instalado (usado en esta validación: Node 24; cualquier LTS reciente
   debería servir dado lo simple del stack).
2. `npm install` (instala Playwright, Newman, Allure CLI y todo lo demás desde
   `package.json`).
3. `npm run playwright:install` — descarga los navegadores headless de
   Playwright y sus dependencias de sistema. Sin este paso, `test:ui` falla
   porque no encuentra los binarios de los navegadores.
4. Conexión a internet: tanto la colección de Postman (apunta a
   `petstore.swagger.io`) como los tests de ejemplo de Playwright (apuntan a
   `playwright.dev`) dependen de sitios externos reales. Si se corre en un
   entorno sin salida a internet, hay que reemplazar esos targets por un
   servicio propio o un mock local.

## 7. Pipeline de Jenkins (`Jenkinsfile`)

El `Jenkinsfile` en la raíz automatiza exactamente el mismo flujo validado a
mano: instalar, correr API + UI, y publicar un reporte Allure consolidado.
Corre en un agente **Windows** (usa pasos `bat`), dispara por `pollSCM` cada 5
minutos y por `cron` todos los días a las 8:00 AM, y usa la tool `nodejs
'node20'` configurada en Jenkins.

### Supuestos de infraestructura (confirmados con el usuario, no verificables desde el repo)

- El servidor Jenkins tiene instalado el **Allure Jenkins Plugin**, con un
  **Allure Commandline** configurado en *Manage Jenkins → Global Tool
  Configuration*. El paso `allure([...])` al final del pipeline depende de
  eso — es un plugin/commandline **distinto** del paquete `allure` (Allure
  Report 3, JS) que usamos localmente vía `npm run report:generate`; ambos
  leen el mismo formato de `allure-results/`, pero el plugin de Jenkins
  genera su propio reporte con historial de tendencia entre builds y lo sirve
  sin los problemas de CSP que tiene `publishHTML` con reportes cargados de
  JS.
- La tool NodeJS se llama exactamente `node20` en ese Jenkins.
- Todos los agentes de ese Jenkins son Windows (por eso se dejó `agent any`
  sin restringir por label).
- El agente tiene Java instalado (lo exige el commandline de Allure que usa
  el plugin).

Si alguno de estos puntos cambia, hay que ajustar el `Jenkinsfile` en
consecuencia (label del agente, nombre de la tool NodeJS, o reemplazar el
paso `allure([...])` por un `publishHTML` sobre el `allure-report/` que ya
genera `npm run report:generate`).

### Qué corrige respecto al `Jenkinsfile` original

El archivo original apuntaba a otro proyecto (rutas y scripts que no existen
acá) y tenía un bug de flujo real, no solo de rutas:

1. **Rutas y scripts inexistentes en este repo**, corregidos:
   - `api\collections\API_Automation_Project_collection.json` y
     `api\environments\workspace.postman_globals.json` → no existen; se
     reemplazó por una verificación de que exista **al menos una** colección
     en `tests\api\*.postman_collection.json` (sin asumir un nombre fijo ni
     un environment obligatorio, igual que hace `scripts/run-api-tests.js`).
   - `playwright.config.mjs` → el archivo real es `playwright.config.js`.
   - `npm run api:test` / `npm run ui:test` → los scripts reales son
     `npm run test:api` y `npm run test:ui`.
2. **Bug de flujo (el más importante):** el original invocaba `bat` de forma
   directa para correr los tests. En un `bat` que falla, Jenkins lanza una
   excepción que **aborta el pipeline inmediatamente** y salta directo al
   `post` final — es decir, si Newman fallaba, **la etapa de Playwright ni
   siquiera llegaba a correr**, y el reporte consolidado quedaba con la mitad
   de la información (justo lo opuesto a lo que se pidió). Se corrigió
   ejecutando ambas suites con `bat(script: '...', returnStatus: true)` y
   marcando el build como `unstable(...)` si el exit code no es `0`, en vez
   de abortar. Esto refleja el mismo criterio que ya usa `npm run test:all`
   localmente (`run-s -c`): correr todo, reportar todo, fallar el build al
   final si algo falló.
3. **Navegadores de Playwright incompletos:** el original solo instalaba
   Chromium (`playwright install --with-deps chromium`), pero
   `playwright.config.js` corre los specs en **chromium + firefox + webkit**.
   Con esa instalación parcial, los proyectos `firefox` y `webkit` habrían
   fallado en CI por binarios faltantes. Se corrigió instalando los tres
   navegadores (`playwright install --with-deps`, sin restringir el motor).
4. **Reporte HTML de API roto:** el original esperaba
   `reports\api-report\api-report.html`, un archivo que nunca se generaba
   (no había reporter HTML configurado para Newman). Se agregó
   `newman-reporter-htmlextra` a `scripts/run-api-tests.js` (ver sección 4,
   punto 6) para que ese archivo exista de verdad, con un `index.html` que
   funciona aunque haya una o varias colecciones.
5. **`wmic` para espacio en disco:** es un comando heredado que Windows viene
   retirando (no está garantizado en versiones recientes de Windows
   Server/11). Se reemplazó por un `Get-CimInstance` vía PowerShell,
   silenciado con `2>nul` para que nunca tumbe la etapa de verificación
   previa por esto.
6. **Variables de entorno declaradas pero nunca usadas**
   (`WORKSPACE_REPORTS`, `API_REPORT_DIR`, `UI_REPORT_DIR`,
   `ALLURE_RESULTS_DIR`): se quitaron; todas las etapas ya usaban rutas
   relativas literales de todos modos, así que esas variables eran ruido.

### Qué genera y publica el pipeline

- **`archiveArtifacts`** de `reports/api-report/**/*` y `reports/ui-report/**/*`
  (los HTML sueltos por si alguien quiere el detalle de una suite puntual).
- **`publishHTML`** de esos mismos dos reportes, como enlaces separados en la
  página del build.
- **`allure([...])`** al final, sobre `allure-results/` — este es **el
  entregable principal**: un solo dashboard con las suites de API y de UI
  juntas, con historial de tendencia entre builds gracias al plugin.

## 8. Pendientes / recomendaciones a futuro (no implementadas todavía)

Estas son sugerencias para cuando el proyecto crezca; no se aplicaron porque
exceden lo mínimo para dejarlo funcional hoy, pero vale la pena tenerlas en el
radar:

- **CI/CD**: ya cubierto para Jenkins (ver sección 7). Si en el futuro
  también se quiere correr en GitHub Actions/GitLab CI (por ejemplo como
  respaldo o para PRs desde forks sin acceso al Jenkins interno), el mismo
  `npm run test:all` sirve tal cual — solo faltaría `npm ci`,
  `npx playwright install --with-deps` y publicar `allure-report/` como
  artefacto o página estática de ese runner.
- **Manejo de secretos/entornos**: si en algún momento la API o la UI dejan de
  ser públicas y requieren credenciales, usar variables de entorno (`.env`,
  ya agregado a `.gitignore`) o secretos de CI — nunca hardcodear tokens en la
  colección de Postman ni en los specs.
- **Linter/formatter** (ESLint + Prettier) para mantener consistencia a medida
  que se sumen más archivos de test entre distintas personas.
- **`npm audit`**: la instalación actual reporta vulnerabilidades conocidas en
  dependencias transitivas (principalmente de la cadena de Newman). No se
  tocó en esta sesión para no introducir cambios de breaking cambiando
  versiones mayores sin pruebas; revisar con `npm audit` periódicamente.
- **Historial de tendencia en Allure** (`trend` entre corridas): ver sección 5
  arriba, es un cambio pequeño si se decide adoptarlo.

## 9. Cómo crear este proyecto desde cero (paso a paso, de punta a punta)

Esta sección es una receta completa y autocontenida: siguiéndola en orden,
cualquier persona sin contexto previo llega al mismo proyecto funcional
descrito arriba, incluyendo pruebas de ejemplo (API + UI) corriendo y
generando el reporte Allure consolidado. No asume nada del resto del
documento.

### 9.1. Prerrequisitos

- **Node.js** LTS reciente (18, 20 o 22 — esta guía se validó con Node 24).
  Verificar con:
  ```bash
  node -v
  npm -v
  ```
- **Git** (opcional pero recomendado, para versionar).
- Conexión a internet: el paso de instalar navegadores de Playwright
  descarga binarios, y las pruebas de ejemplo de este proyecto apuntan a
  sitios públicos (`petstore.swagger.io`, `playwright.dev`).
- En Windows, evitar que la ruta del proyecto tenga caracteres raros; **sí
  puede tener espacios** (este proyecto vive en `Proyecto demo hbrido
  practica`), pero por eso el script de API invoca Newman con `node` en vez
  de `shell: true` (ver 9.6) — si copiás ese patrón no tendrás el problema.

### 9.2. Crear la carpeta del proyecto e inicializar `package.json`

```bash
mkdir mi-proyecto-hibrido
cd mi-proyecto-hibrido
git init
npm init -y
```

Esto crea un `package.json` mínimo. Lo iremos completando en los pasos
siguientes (scripts y dependencias).

### 9.3. Instalar las dependencias, en este orden

Todas son `devDependencies` (herramientas de testing, no runtime de
producción). Instalarlas en tandas lógicas evita confusiones si algo falla:

**1) Playwright (motor de pruebas UI)**
```bash
npm install -D @playwright/test @types/node
```

**2) Newman (runner de colecciones Postman) y sus reporters**
```bash
npm install -D newman newman-reporter-allure newman-reporter-htmlextra
```
- `newman-reporter-allure` escribe los resultados en formato Allure.
- `newman-reporter-htmlextra` genera un HTML legible por humano, por
  colección (artefacto secundario, no reemplaza a Allure).

**3) Allure (reporte consolidado)**
```bash
npm install -D allure allure-playwright
```
- `allure` es la **CLI de Allure Report 3** (paquete JS, no el
  `allure-commandline` clásico de Java). Su sintaxis difiere un poco de
  Allure 2 (por ejemplo, `allure generate` en v3 no acepta `--clean`).
- `allure-playwright` es el reporter que conecta Playwright con Allure.

**4) Utilidades de orquestación de scripts**
```bash
npm install -D rimraf npm-run-all2
```
- `rimraf` borra carpetas de forma multiplataforma (Windows/Mac/Linux) sin
  depender de `rm -rf`.
- `npm-run-all2` permite encadenar scripts de npm con la flag `-c`
  (continue-on-error), clave para que el pipeline siga corriendo aunque una
  suite falle y el reporte se genere igual.

Al terminar, `package.json` debería tener este bloque `devDependencies`
(las versiones concretas pueden variar según cuándo instales):
```json
"devDependencies": {
  "@playwright/test": "^1.63.0",
  "@types/node": "^26.6.2",
  "allure": "^3.18.0",
  "allure-playwright": "^3.12.2",
  "newman": "^6.2.2",
  "newman-reporter-allure": "^3.12.2",
  "newman-reporter-htmlextra": "^1.23.1",
  "npm-run-all2": "^9.0.3",
  "rimraf": "^6.1.3"
}
```

### 9.4. Crear la estructura de carpetas

```bash
mkdir -p tests/api tests/ui scripts
```

Estructura resultante:
```
mi-proyecto-hibrido/
  scripts/
  tests/
    api/
    ui/
  package.json
```

### 9.5. Crear `playwright.config.js`

Archivo nuevo en la raíz del proyecto. Los puntos clave (comentados abajo)
son `testDir: './tests/ui'` (para que Playwright no intente leer los JSON
de Postman en `tests/api`) y el reporter `allure-playwright` apuntando a
`allure-results`, la misma carpeta que usará Newman:

```js
// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['allure-playwright', { resultsDir: 'allure-results', detail: true, suiteTitle: false }],
  ],
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
```

> Nota: aunque `package.json` tiene `"type": "commonjs"` (por defecto de
> `npm init`), Playwright carga su archivo de configuración con su propio
> loader interno, así que la sintaxis `import`/`export default` funciona
> igual dentro de `playwright.config.js` sin necesidad de renombrarlo a
> `.mjs` ni cambiar el `"type"` del proyecto.

### 9.6. Crear `scripts/run-api-tests.js`

Newman por sí solo corre **una** colección por invocación. Este script la
reemplaza por un runner que descubre automáticamente todas las colecciones
en `tests/api/` y las corre una por una, para que agregar una colección
nueva sea simplemente copiar el archivo (sin tocar `package.json`):

```js
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const apiDir = path.join(__dirname, '..', 'tests', 'api');
const resultsDir = path.join(__dirname, '..', 'allure-results');
const htmlReportDir = path.join(__dirname, '..', 'reports', 'api-report');
const newmanBin = require.resolve('newman/bin/newman.js');

const collectionSuffix = '.postman_collection.json';
const environmentSuffix = '.postman_environment.json';

const collections = fs
  .readdirSync(apiDir)
  .filter((file) => file.endsWith(collectionSuffix))
  .sort();

if (collections.length === 0) {
  console.log(`No se encontraron colecciones (*${collectionSuffix}) en ${apiDir}`);
  process.exit(0);
}

console.log(`Colecciones encontradas (${collections.length}):`);
collections.forEach((file) => console.log(`  - ${file}`));
console.log('');

fs.mkdirSync(htmlReportDir, { recursive: true });

let worstExitCode = 0;
const htmlReports = [];

for (const collectionFile of collections) {
  const baseName = collectionFile.slice(0, -collectionSuffix.length);
  const environmentFile = `${baseName}${environmentSuffix}`;
  const environmentPath = path.join(apiDir, environmentFile);
  const htmlReportFile = `${baseName}.html`;

  const args = [
    newmanBin,
    'run',
    path.join(apiDir, collectionFile),
    '-r',
    'cli,allure,htmlextra',
    '--reporter-allure-export',
    resultsDir,
    '--reporter-htmlextra-export',
    path.join(htmlReportDir, htmlReportFile),
    '--reporter-htmlextra-title',
    baseName,
  ];

  if (fs.existsSync(environmentPath)) {
    args.push('-e', environmentPath);
    console.log(`>> Ejecutando ${collectionFile} (con environment ${environmentFile})`);
  } else {
    console.log(`>> Ejecutando ${collectionFile}`);
  }

  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  const exitCode = result.status ?? 1;

  if (exitCode !== 0) {
    worstExitCode = exitCode;
    console.error(`✗ ${collectionFile} terminó con código ${exitCode}`);
  } else {
    htmlReports.push({ baseName, htmlReportFile });
  }

  console.log('');
}

const indexLinks = htmlReports
  .map(({ baseName, htmlReportFile }) => `    <li><a href="./${htmlReportFile}">${baseName}</a></li>`)
  .join('\n');

fs.writeFileSync(
  path.join(htmlReportDir, 'index.html'),
  `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Reportes API (Newman)</title></head>
<body>
  <h1>Reportes API (Newman)</h1>
  <ul>
${indexLinks || '    <li>No se generó ningún reporte HTML.</li>'}
  </ul>
</body>
</html>
`,
);

process.exit(worstExitCode);
```

**Por qué se invoca así (`spawnSync(process.execPath, [newmanBin, ...])`)
y no `spawnSync('newman', [...], { shell: true })`:** si la ruta del
proyecto tiene espacios (como en este repo), correrlo vía shell rompe el
citado de argumentos y falla con `ENOENT` cortando la ruta en el primer
espacio. Invocar el binario de Newman directamente con `node` evita ese
problema.

### 9.7. Configurar los scripts en `package.json`

Reemplazar el bloque `"scripts"` generado por `npm init -y` por:

```json
"scripts": {
  "clean:allure": "rimraf allure-results allure-report",
  "test:api": "node scripts/run-api-tests.js",
  "test:ui": "playwright test",
  "test:ui:headed": "playwright test --headed",
  "test:all": "run-s -c clean:allure test:api test:ui report:generate",
  "report:generate": "allure generate allure-results -o allure-report",
  "report:open": "allure open allure-report",
  "report": "run-s report:generate report:open",
  "test": "run-s test:all",
  "playwright:install": "playwright install --with-deps"
}
```

Notas:
- `test:all` usa `run-s -c` (de `npm-run-all2`, con continue-on-error): si
  `test:api` o `test:ui` fallan, igual sigue hasta `report:generate`, y el
  comando completo termina con código de salida distinto de cero al final
  (para que un CI lo detecte) sin dejar el reporte a medio generar.
- Verificar que `"type"` en `package.json` sea `"commonjs"` (el default de
  `npm init -y`) — `scripts/run-api-tests.js` usa `require`, así que si el
  proyecto fuera `"type": "module"` habría que renombrarlo a `.cjs`.

### 9.8. Crear `.gitignore`

```gitignore
# Playwright
node_modules/
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
/playwright/.auth/

# Allure (resultados y reporte generado, no se versionan)
/allure-results/
/allure-report/

# Newman (reportes sueltos si se usan otros reporters localmente)
/newman/

# Reportes HTML de API y UI generados por scripts/run-api-tests.js
/reports/

# Entornos locales
.env
.env.local
```

### 9.9. Instalar los navegadores de Playwright

Paso obligatorio una sola vez por máquina (o por agente de CI). Sin esto,
`test:ui` falla porque no encuentra los binarios de los navegadores:

```bash
npm run playwright:install
```

(equivale a `playwright install --with-deps`, que instala Chromium,
Firefox y WebKit más las dependencias de sistema operativo que cada uno
necesita).

### 9.10. Agregar las pruebas de ejemplo

**API (Postman/Newman):**

1. Crear una colección en Postman (o usar una existente) contra cualquier
   API de prueba pública, por ejemplo
   [Petstore Swagger](https://petstore.swagger.io/v2).
2. Exportarla como **Collection v2.1**.
3. Guardarla en `tests/api/<nombre>.postman_collection.json` — el nombre de
   archivo es libre, el script la descubre por el sufijo.
4. Cada `pm.test(...)` dentro de la colección debería, como mínimo,
   validar status code, tiempo de respuesta y `Content-Type`.
5. (Opcional) Si la colección necesita variables (`baseUrl`, tokens, etc.),
   exportar también el Environment como
   `tests/api/<mismo-nombre>.postman_environment.json` — el script lo
   detecta automáticamente por coincidencia de nombre y lo pasa con `-e`.

**UI (Playwright):**

Crear `tests/ui/example.spec.js` con un spec mínimo de humo:

```js
const { test, expect } = require('@playwright/test');

test('la home de Playwright carga y tiene el título esperado', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  await expect(page).toHaveTitle(/Playwright/);
});
```

A medida que crezcan las pruebas reales del proyecto: agrupar con
`test.describe()` (se ven como "suites" en Allure), usar `test.step()`
para pasos intermedios (Allure los traduce en steps automáticamente), y
considerar un patrón Page Object Model (`tests/ui/pages/`) si el número de
specs crece.

### 9.11. Ejecutar todo y verificar que funciona

```bash
npm install                # si clonaste el repo en vez de armarlo a mano
npm run playwright:install # una sola vez por máquina
npm run test:all           # limpia -> corre API -> corre UI -> genera reporte
npm run report:open        # sirve y abre allure-report/ en el navegador
```

Qué esperar si todo quedó bien armado:
- La consola muestra primero la corrida de Newman (colección por
  colección) y después la de Playwright (chromium/firefox/webkit).
- Se crean las carpetas `allure-results/` (datos crudos) y `allure-report/`
  (HTML final), y `reports/api-report/` con el HTML legible de Newman.
- `npm run report:open` abre un dashboard de Allure con **una sola vista**
  que mezcla las suites de API y de UI.
- Si algo falla intencionalmente (por ejemplo, cambiás el `expect` del
  spec de ejemplo para que falle), `npm run test:all` debe terminar con
  código de salida distinto de cero, pero el reporte igual se genera y
  muestra el test en rojo — así se confirma que el pipeline "falla visible"
  en vez de "falla silencioso".

Con estos 11 pasos el proyecto queda funcionalmente idéntico al descrito
en las secciones 1 a 8 de esta guía. Para integrarlo a Jenkins, replicar el
mismo flujo (`npm ci` → `playwright:install` → `test:api` → `test:ui` →
`report:generate`, cada etapa con `returnStatus: true` para no abortar el
pipeline en el primer fallo) — ver la sección 7 para el `Jenkinsfile` de
referencia ya armado.
