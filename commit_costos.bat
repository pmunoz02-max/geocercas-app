@echo off
REM commit_costos.bat
REM Script para hacer commit de los cambios del módulo de Actividades + Costos

echo.
echo Directorio actual:
echo %CD%
echo.

echo ===== git status (ANTES) =====
git status
echo.

echo Agregando todos los archivos al staging...
git add .
echo.

set COMMIT_MSG=feat: actividades con costos y reporte de costos por asignacion

echo Haciendo commit con mensaje:
echo   %COMMIT_MSG%
git commit -m "%COMMIT_MSG%"
IF ERRORLEVEL 1 (
    echo.
    echo No se pudo hacer commit (quizas no hay cambios nuevos).
    goto end
)

echo.
echo ===== git status (DESPUES) =====
git status
echo.
echo Commit realizado correctamente.

:end
pause

