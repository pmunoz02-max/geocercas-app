# ==============================
# Script de deploy a Vercel vía Git (PowerShell)
# - Hace add, commit y push al branch actual
# - Vercel toma el push y hace el deploy
# ==============================

param(
    [string]$CommitMessage = "chore: update asignaciones local time"
)

Write-Host "=== Detectando raíz del repositorio Git ==="
$repoRoot = git rev-parse --show-toplevel
if (-not $repoRoot) {
    Write-Host "No se pudo detectar la raíz del repositorio. ¿Estás dentro de un repo Git?" -ForegroundColor Red
    exit 1
}

Set-Location $repoRoot
Write-Host "Repositorio: $repoRoot"
Write-Host ""

Write-Host "=== Estado actual (git status) ==="
git status
Write-Host ""

# Confirmación interactiva
$reply = Read-Host "¿Continuar con add + commit + push? [s/N]"
if ($reply -notmatch '^[sS]$') {
    Write-Host "Operación cancelada."
    exit 0
}

Write-Host ""
Write-Host "=== Agregando archivos (git add .) ==="
git add .

Write-Host "=== Haciendo commit ==="
try {
    git commit -m "$CommitMessage"
    Write-Host "Commit creado correctamente."
}
catch {
    Write-Host "No se creó commit (posiblemente no había cambios)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Detectando branch actual ==="
$currentBranch = git rev-parse --abbrev-ref HEAD
Write-Host "Branch actual: $currentBranch"
Write-Host ""

Write-Host "=== Haciendo push a origin/$currentBranch ==="
git push origin "$currentBranch"

Write-Host ""
Write-Host "✅ Listo. Push enviado a Git."
Write-Host "   Vercel tomará este push y hará el deploy según la configuración de tu proyecto."
