pipeline {
    agent any

    triggers {
        // 1. Automatización por cambios (Sondeo/Poll SCM)
        // Revisa el repositorio cada 5 min. Si hay cambios, ejecuta.
        pollSCM('H/5 * * * *')
        // 2. Ejecución programada
        // Se ejecuta todos los días a las 8:00 AM (hora del servidor)
        cron('H 08 * * *')
    }

    tools {
        nodejs 'node20' // Debe coincidir con el nombre configurado en Manage Jenkins > Tools > NodeJS
    }

    stages {
        stage('Checkout') {
            steps {
                cleanWs() // Limpia el workspace primero
                checkout scm
            }
        }

        stage('✅ Verificación previa') {
            steps {
                script {
                    echo 'Verificando que el entorno y los archivos necesarios estén listos antes del build...'
                    bat '''
                        echo ===== VERSIONES DE HERRAMIENTAS =====
                        node -v || (echo ERROR: Node.js no esta instalado o no esta en PATH && exit /b 1)
                        npm -v  || (echo ERROR: npm no esta instalado o no esta en PATH && exit /b 1)
                        java -version || (echo ERROR: Java no esta instalado o no esta en PATH ^(requerido por el plugin de Allure^) && exit /b 1)

                        echo.
                        echo ===== ARCHIVOS CLAVE DEL PROYECTO =====
                        if not exist "tests\\api\\*.postman_collection.json" (
                            echo ERROR: No se encontro ninguna coleccion de Postman en tests\\api
                            exit /b 1
                        )
                        if not exist "tests\\ui" (
                            echo ERROR: No se encuentra la carpeta tests\\ui
                            exit /b 1
                        )
                        if not exist "playwright.config.js" (
                            echo ERROR: No se encuentra playwright.config.js
                            exit /b 1
                        )
                        if not exist "package.json" (
                            echo ERROR: No se encuentra package.json
                            exit /b 1
                        )
                        echo Todos los archivos clave estan presentes.

                        echo.
                        echo ===== COLECCIONES DE POSTMAN DETECTADAS =====
                        dir /b tests\\api\\*.postman_collection.json

                        echo.
                        echo ===== ESPACIO EN DISCO =====
                        powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,@{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB,1)}},@{N='SizeGB';E={[math]::Round($_.Size/1GB,1)}} | Format-Table -AutoSize" 2>nul

                        echo.
                        echo Verificacion previa completada correctamente.
                    '''
                }
            }
        }

        stage('📦 Instalación de Dependencias') {
            steps {
                script {
                    echo 'Instalando dependencias de npm...'
                    bat 'npm ci --no-audit'

                    // El proyecto corre UI en chromium, firefox y webkit (ver playwright.config.js),
                    // así que se instalan los tres navegadores para que la etapa de UI no falle
                    // por binarios faltantes.
                    echo 'Instalando navegadores de Playwright (chromium, firefox, webkit)...'
                    bat 'npx playwright install --with-deps'
                }
            }
        }

        stage('Preparar carpetas de reportes') {
            steps {
                script {
                    echo 'Creando carpetas de reportes/resultados...'
                    bat '''
                        if not exist reports mkdir reports
                        if not exist reports\\api-report mkdir reports\\api-report
                        if not exist reports\\ui-report mkdir reports\\ui-report
                        if not exist allure-results mkdir allure-results
                    '''
                }
            }
        }

        stage('Ejecución API (Newman)') {
            steps {
                script {
                    echo 'Ejecutando todas las colecciones de tests/api con Newman...'

                    // npm run test:api -> scripts/run-api-tests.js: descubre automáticamente
                    // TODAS las colecciones en tests/api/, y por cada una escribe:
                    //   - allure-results/            (para el reporte Allure consolidado)
                    //   - reports/api-report/*.html  (reporte HTML legible, uno por colección)
                    // No se corta ante el primer error: sigue con el resto y termina con
                    // exit code != 0 si alguna colección falló (unstable(), no abort).
                    def apiExitCode = bat(script: 'call npm run test:api', returnStatus: true)

                    echo "npm run test:api finalizó con exit code ${apiExitCode}"
                    if (apiExitCode != 0) {
                        unstable('Al menos una colección de Postman falló (ver reporte Allure/API para el detalle).')
                    }

                    bat '''
                        echo.
                        echo ===== VERIFICANDO REPORTE API =====
                        if exist reports\\api-report\\index.html (
                            echo Reporte API generado: reports\\api-report\\index.html
                            dir reports\\api-report
                        ) else (
                            echo NO se genero el reporte API
                        )
                    '''
                }
            }
            post {
                always {
                    script {
                        if (fileExists("${env.WORKSPACE}\\reports\\api-report\\index.html")) {
                            echo 'Archivando reporte API...'
                            archiveArtifacts artifacts: 'reports/api-report/**/*', allowEmptyArchive: true
                        }
                    }
                }
            }
        }

        stage('Ejecución UI (Playwright)') {
            steps {
                script {
                    echo 'Ejecutando pruebas UI con Playwright...'

                    // npm run test:ui -> playwright test (chromium+firefox+webkit).
                    // playwright.config.js ya trae el reporter 'html' -> ./playwright-report
                    // y el reporter 'allure-playwright' -> ./allure-results (mismo dir que Newman).
                    def uiExitCode = bat(script: '''
                        set CI=true
                        set PLAYWRIGHT_TEST_TIMEOUT=30000
                        chcp 65001 > nul
                        set NODE_OPTIONS=--max-old-space-size=4096
                        call npm run test:ui
                    ''', returnStatus: true)

                    echo "npm run test:ui finalizó con exit code ${uiExitCode}"
                    if (uiExitCode != 0) {
                        unstable('Al menos un test de UI falló (ver reporte Allure/UI para el detalle).')
                    }

                    bat '''
                        echo.
                        echo ===== MOVIENDO REPORTE DE PLAYWRIGHT =====
                        if exist playwright-report (
                            echo Moviendo playwright-report a reports\\ui-report...
                            xcopy /E /I /Y playwright-report\\* reports\\ui-report\\ >nul
                            rmdir /S /Q playwright-report
                        ) else (
                            echo NO existe playwright-report ^(revisar reporter 'html' en playwright.config.js^)
                        )

                        echo.
                        echo ===== VERIFICANDO REPORTE UI =====
                        if exist reports\\ui-report\\index.html (
                            echo Reporte UI generado: reports\\ui-report\\index.html
                        ) else (
                            echo NO se genero el reporte UI
                        )
                    '''
                }
            }
            post {
                always {
                    script {
                        if (fileExists("${env.WORKSPACE}\\reports\\ui-report\\index.html")) {
                            echo 'Archivando reporte UI...'
                            archiveArtifacts artifacts: 'reports/ui-report/**/*', allowEmptyArchive: true
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                echo 'Publicando reportes en Jenkins...'

                bat '''
                    echo ===== CONTENIDO DE REPORTS =====
                    if exist reports (
                        tree reports /F
                    ) else (
                        echo NO EXISTE LA CARPETA REPORTS
                    )
                '''

                if (fileExists("${env.WORKSPACE}\\reports\\api-report\\index.html")) {
                    echo 'Publicando reporte API (Newman)...'
                    publishHTML([
                        reportDir: 'reports/api-report',
                        reportFiles: 'index.html',
                        reportName: 'Reporte API (Newman)',
                        keepAll: true,
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        includes: '**/*'
                    ])
                } else {
                    echo 'Reporte API no encontrado, se omite publishHTML.'
                }

                if (fileExists("${env.WORKSPACE}\\reports\\ui-report\\index.html")) {
                    echo 'Publicando reporte UI (Playwright)...'
                    publishHTML([
                        reportDir: 'reports/ui-report',
                        reportFiles: 'index.html',
                        reportName: 'Reporte UI (Playwright)',
                        keepAll: true,
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        includes: '**/*'
                    ])
                } else {
                    echo 'Reporte UI no encontrado, se omite publishHTML.'
                }

                // Reporte consolidado: API (Newman) + UI (Playwright) en un solo dashboard,
                // generado por el Allure Jenkins Plugin a partir de allure-results/, con
                // historial de tendencias entre builds.
                echo 'Publicando reporte Allure consolidado...'
                allure([
                    includeProperties: false,
                    results: [[path: 'allure-results']]
                ])
            }
        }

        success {
            echo '¡Pipeline ejecutado exitosamente! Reportes disponibles en la página del build de Jenkins.'
        }

        unstable {
            echo 'Pipeline completado con pruebas fallidas. Revisa el reporte Allure para el detalle.'
        }

        failure {
            echo 'Pipeline falló antes de poder ejecutar o reportar las pruebas. Revisa los logs de las etapas anteriores.'
        }

        cleanup {
            echo 'Limpieza finalizada.'
        }
    }
}
