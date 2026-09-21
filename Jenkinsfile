pipeline {
    agent any

    triggers {
        // 1. Automatización por cambios (Sondeo/Poll SCM)
    // Revisa GitHub cada 5 min. Si hay cambios, ejecuta.
        pollSCM('H/5 * * * *') 
        // 2. Ejecución Programada
    // Se ejecuta todos los días a las 8:00 AM (Hora del servidor)
        cron('H 08 * * *')
    }
    
    tools {
        nodejs 'node20' // Asegúrate de tener NodeJS configurado en Jenkins
    }
    
    environment {
        // Variables para las rutas de reportes
        WORKSPACE_REPORTS = "${env.WORKSPACE}\\reports"
        API_REPORT_DIR = "${env.WORKSPACE}\\reports\\api-report"
        UI_REPORT_DIR = "${env.WORKSPACE}\\reports\\ui-report"
        ALLURE_RESULTS_DIR = "${env.WORKSPACE}\\allure-results"
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
                        java -version || (echo ERROR: Java no esta instalado o no esta en PATH ^(requerido por Allure^) && exit /b 1)

                        echo.
                        echo ===== ARCHIVOS CLAVE DEL PROYECTO =====
                        if not exist "api\\collections\\API_Automation_Project_collection.json" (
                            echo ERROR: No se encuentra la coleccion de Postman
                            exit /b 1
                        )
                        if not exist "api\\environments\\workspace.postman_globals.json" (
                            echo ERROR: No se encuentra el archivo de globals de Postman
                            exit /b 1
                        )
                        if not exist "playwright.config.mjs" (
                            echo ERROR: No se encuentra playwright.config.mjs
                            exit /b 1
                        )
                        if not exist "package.json" (
                            echo ERROR: No se encuentra package.json
                            exit /b 1
                        )
                        echo Todos los archivos clave estan presentes.

                        echo.
                        echo ===== ESPACIO EN DISCO =====
                        wmic logicaldisk get caption,freespace,size

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
                    
                    echo 'Instalando navegadores de Playwright...'
                    bat 'npx playwright install --with-deps chromium'
                }
            }
        }
        
        stage('Verificar Archivos API') {
            steps {
                script {
                    echo 'Verificando estructura de archivos API...'
                    bat '''
                        echo ===== ESTRUCTURA DE ARCHIVOS =====
                        echo Directorio actual: %CD%
                        echo.
                        echo --- Carpeta api/collections ---
                        if exist api\\collections (
                            dir api\\collections
                        ) else (
                            echo NO EXISTE api\\collections
                        )
                        echo.
                        echo --- Carpeta api/environments ---
                        if exist api\\environments (
                            dir api\\environments
                        ) else (
                            echo NO EXISTE api\\environments
                        )
                        echo.
                        echo --- Creando directorios de reportes ---
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
                    echo 'Ejecutando pruebas API con Newman...'
                    
                    bat '''
                        echo Ejecutando: npm run api:test
                        call npm run api:test
                        
                        echo.
                        echo ===== VERIFICANDO REPORTE API =====
                        if exist reports\\api-report\\api-report.html (
                            echo Reporte API generado: reports\\api-report\\api-report.html
                            echo Tamaño del archivo:
                            dir reports\\api-report\\api-report.html
                        ) else (
                            echo NO se generó el reporte API
                            echo Contenido de reports\\api-report:
                            if exist reports\\api-report dir reports\\api-report
                        )
                    '''
                }
            }
            post {
                always {
                    script {
                        // Archivar el reporte de API
                        if (fileExists("${env.WORKSPACE}\\reports\\api-report\\api-report.html")) {
                            echo "Archivando reporte API..."
                            archiveArtifacts artifacts: 'reports/api-report/api-report.html', allowEmptyArchive: true
                        }
                    }
                }
            }
        }
        
        stage('Ejecución UI (Playwright)') {
            steps {
                script {
                    echo 'Ejecutando pruebas UI con Playwright...'
                    
                    bat '''
                        echo Configurando variables de entorno...
                        set CI=true
                        set PLAYWRIGHT_TEST_TIMEOUT=30000

                        chcp 65001 > nul
                        set NODE_OPTIONS=--max-old-space-size=4096
                        
                        echo Ejecutando: npm run ui:test
                        call npm run ui:test
                        
                        echo.
                        echo ===== MOVIENDO REPORTE DE PLAYWRIGHT =====
                        echo Directorio playwright-report existe?
                        if exist playwright-report (
                            echo Sí existe playwright-report
                            echo Moviendo a reports/ui-report...
                            if not exist reports\\ui-report mkdir reports\\ui-report
                            xcopy /E /I /Y playwright-report\\* reports\\ui-report\\
                            echo Eliminando playwright-report original...
                            rmdir /S /Q playwright-report
                        ) else (
                            echo NO existe playwright-report
                            echo Intentando encontrar reportes generados por configuración...
                            dir /s /b *report* 2>nul
                        )
                        
                        echo.
                        echo ===== VERIFICANDO REPORTE UI =====
                        if exist reports\\ui-report\\index.html (
                            echo Reporte UI generado: reports\\ui-report\\index.html
                            echo Tamaño del archivo:
                            dir reports\\ui-report\\index.html
                        ) else (
                            echo NO se generó el reporte UI
                            echo Contenido de reports\\ui-report:
                            if exist reports\\ui-report dir reports\\ui-report
                        )
                    '''
                }
            }
            post {
                always {
                    script {
                        // Archivar el reporte de UI
                        if (fileExists("${env.WORKSPACE}\\reports\\ui-report\\index.html")) {
                            echo "Archivando reporte UI..."
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
                
                // Publicar reporte API si existe
                def apiReportFile = "${env.WORKSPACE}\\reports\\api-report\\api-report.html"
                def uiReportFile = "${env.WORKSPACE}\\reports\\ui-report\\index.html"
                
                echo "Buscando reporte API en: ${apiReportFile}"
                echo "Buscando reporte UI en: ${uiReportFile}"
                
                // Verificar y listar contenido
                bat '''
                    echo ===== CONTENIDO DE REPORTS =====
                    if exist reports (
                        tree reports /F
                    ) else (
                        echo NO EXISTE LA CARPETA REPORTS
                    )
                '''
                
                if (fileExists(apiReportFile)) {
                    echo "Encontrado reporte API. Publicando..."
                    publishHTML([
                        reportDir: 'reports/api-report',
                        reportFiles: 'api-report.html',
                        reportName: 'Reporte API (Newman)',
                        keepAll: true,
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        includes: '**/*'
                    ])
                } else {
                    echo "Reporte API no encontrado en ${apiReportFile}"
                    // Crear un reporte vacío para debugging
                    bat '''
                        echo "<html><body><h1>Reporte API no generado</h1><p>Revisa los logs para más detalles.</p></body></html>" > reports/api-report/error.html
                    '''
                }
                
                if (fileExists(uiReportFile)) {
                    echo "Encontrado reporte UI. Publicando..."
                    publishHTML([
                        reportDir: 'reports/ui-report',
                        reportFiles: 'index.html',
                        reportName: 'Reporte UI (Playwright)',
                        keepAll: true,
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        includes: '**/*'
                    ])
                } else {
                    echo "Reporte UI no encontrado en ${uiReportFile}"
                    // Verificar si hay otros archivos HTML
                    bat '''
                        echo Buscando archivos HTML alternativos...
                        dir /s /b reports\\ui-report\\*.html 2>nul
                    '''
                }

                // Publicar el reporte combinado de Allure (API + UI en un solo dashboard,
                // con historial de tendencias entre builds gracias al Allure Jenkins Plugin).
                echo "Publicando reporte Allure..."
                allure([
                    includeProperties: false,
                    results: [[path: 'allure-results']]
                ])
            }
        }
        
        success {
            echo '¡Pipeline ejecutado exitosamente!'
            echo 'Reportes disponibles en la página del build de Jenkins'
        }
        
        failure {
            echo 'Pipeline falló. Revisa los logs anteriores.'
            // Capturar logs de error
            bat '''
                echo ===== ÚLTIMOS ERRORES =====
                echo Revisa los pasos anteriores para ver los errores específicos
            '''
        }
        
        cleanup {
            // Opcional: mantener workspace para debugging
            echo 'Limpieza finalizada'
        }
    }
}