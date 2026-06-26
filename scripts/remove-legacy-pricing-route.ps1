$ErrorActionPreference = "Stop"

$repoRoot = (git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) {
  throw "No se pudo identificar la raíz del repositorio Git."
}

$branch = (git -C $repoRoot branch --show-current).Trim()
if ($branch -ne "preview") {
  throw "Operación cancelada: la branch actual es '$branch'. Debe ser 'preview'."
}

$legacyFiles = @(
  (Join-Path $repoRoot "public\pricing\index.html"),
  (Join-Path $repoRoot "public\precios\index.html")
)

foreach ($file in $legacyFiles) {
  if (Test-Path $file) {
    Remove-Item -LiteralPath $file -Force
    Write-Host "Eliminado: $file"
  } else {
    Write-Host "No existe, sin cambios: $file"
  }
}

$legacyDirs = @(
  (Join-Path $repoRoot "public\pricing"),
  (Join-Path $repoRoot "public\precios")
)

foreach ($dir in $legacyDirs) {
  if (Test-Path $dir) {
    $items = @(Get-ChildItem -LiteralPath $dir -Force)
    if ($items.Count -eq 0) {
      Remove-Item -LiteralPath $dir -Force
      Write-Host "Directorio vacío eliminado: $dir"
    } else {
      Write-Host "Directorio conservado porque contiene otros archivos: $dir"
    }
  }
}

Write-Host "`nVerificación de cambios:"
git -C $repoRoot status --short -- public/pricing public/precios docs/DODO_CHECKOUT_PREVIEW_INTEGRATION.md scripts/remove-legacy-pricing-route.ps1

Write-Host "`nEjecutando build local..."
Push-Location $repoRoot
try {
  npm run build
} finally {
  Pop-Location
}

Write-Host "`nCorrección aplicada correctamente en branch preview."
