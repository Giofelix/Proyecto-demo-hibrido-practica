// Corre con Newman TODAS las colecciones Postman que encuentre en tests/api/,
// para que agregar una colección nueva sea "copiar el archivo", sin tocar
// package.json ni ningún script.
//
// Convención de nombres esperada:
//   tests/api/<nombre>.postman_collection.json                 (obligatorio)
//   tests/api/<nombre>.postman_environment.json                (opcional)
//
// Si existe un environment con el mismo <nombre> que la colección, se pasa
// automáticamente con `-e`.
//
// Cada corrida produce dos salidas en paralelo:
//   - allure-results/            -> se combina con Playwright en el reporte
//                                    Allure consolidado (npm run report:generate).
//   - reports/api-report/*.html  -> un reporte HTML legible por humano, uno
//                                    por colección, más un index.html que los
//                                    enlaza a todos (para publishHTML en Jenkins).

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const apiDir = path.join(__dirname, '..', 'tests', 'api');
const resultsDir = path.join(__dirname, '..', 'allure-results');
const htmlReportDir = path.join(__dirname, '..', 'reports', 'api-report');
// Se invoca el binario de Newman directamente con `node` (sin shell) para que
// las rutas con espacios (p. ej. "Proyecto demo hbrido practica") no se
// rompan por falta de citado de argumentos.
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
