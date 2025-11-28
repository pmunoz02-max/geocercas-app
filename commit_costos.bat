@echo off
REM commit_costos.bat
REM Script para hacer commit de los cambios del módulo de Actividades + Costos

echo Directorio actual:
cd
echo.

echo ===== git status (ANTES) =====
git status
echo.

echo Agregando todos los archivos al staging...
git add .
echo.

set COMMIT_MSG=feat: actividades con costos y reporte de costos por asignación

echo Haciendo commit con mensaje:
echo   %COMMIT_MSG%
git commit -m "%COMMIT_MSG%"
IF ERRORLEVEL 1 (
    echo.
    echo ⚠️  No se pudo hacer commit (quizás no hay cambios nuevos).
    goto end
)

echo.
echo ===== git status (DESPUES) =====
git status
echo.

REM (Opcional) push a la rama actual:
REM Descomenta el bloque siguiente si quieres hacer push automático

REM for /f "tokens=*" %%b in ('git rev-parse --abbrev-ref HEAD') do set CURRENT_BRANCH=%%b
REM echo Haciendo push a origin %CURRENT_BRANCH% ...
REM git push origin %CURRENT_BRANCH%

echo ✅ Commit realizado.

:end
pause
