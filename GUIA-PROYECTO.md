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
| `npm run test:api` | Corre **todas** las colecciones Postman encontradas en `tests/api/` con Newman (ver sección "Cómo agregar una colección de Postman nueva"), resultados a `allure-results/`. |
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

## 7. Pendientes / recomendaciones a futuro (no implementadas todavía)

Estas son sugerencias para cuando el proyecto crezca; no se aplicaron porque
exceden lo mínimo para dejarlo funcional hoy, pero vale la pena tenerlas en el
radar:

- **CI/CD**: agregar un workflow (GitHub Actions, GitLab CI, etc.) que corra
  `npm run test:all` en cada push/PR y publique `allure-report/` como
  artefacto o página estática. El pipeline local ya está listo para eso: solo
  hace falta invocar `npm ci`, `npx playwright install --with-deps` y
  `npm run test:all` en el runner.
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
