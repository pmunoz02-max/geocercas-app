# tools/fix-i18n-json.ps1
# Arregla JSON concatenado (}{) y hace deep-merge en un solo objeto.
# Uso:
#   powershell -ExecutionPolicy Bypass -File tools/fix-i18n-json.ps1

$ErrorActionPreference = "Stop"

function DeepMerge($target, $source) {
  foreach ($k in $source.PSObject.Properties.Name) {
    $sv = $source.$k
    if ($null -eq $sv) {
      $target.$k = $sv
      continue
    }
    $tv = $target.$k

    $isSourceObj = $sv -is [pscustomobject]
    $isTargetObj = $tv -is [pscustomobject]

    if ($isSourceObj -and $isTargetObj) {
      DeepMerge -target $tv -source $sv
      $target.$k = $tv
    } else {
      $target.$k = $sv
    }
  }
  return $target
}

function FixFile($path) {
  if (!(Test-Path $path)) { return }

  $text = Get-Content $path -Raw -Encoding UTF8

  # Busca el inicio del segundo JSON: línea que empieza con { seguido de "help"
  # Esto cubre tu caso exacto del log (se ve que empieza un nuevo '{' en la línea 937).
  $marker = "`n{`n  `"help`""
  $idx = $text.IndexOf($marker)

  if ($idx -lt 0) {
    Write-Host "OK (no concatenated JSON detected): $path"
    # Igual lo re-serializamos para asegurar formato válido (si ya parsea)
    $obj = $text | ConvertFrom-Json
    ($obj | ConvertTo-Json -Depth 50) | Set-Content $path -Encoding UTF8
    return
  }

  $first = $text.Substring(0, $idx).Trim()
  $second = $text.Substring($idx).Trim()

  # Parsear ambos
  $o1 = $first | ConvertFrom-Json
  $o2 = $second | ConvertFrom-Json

  # Deep merge: o2 sobre o1
  $merged = DeepMerge -target $o1 -source $o2

  # Guardar bonito y válido
  ($merged | ConvertTo-Json -Depth 50) | Set-Content $path -Encoding UTF8
  Write-Host "FIXED + merged: $path"
}

FixFile "src/i18n/es.json"
FixFile "src/i18n/en.json"
FixFile "src/i18n/fr.json"

Write-Host "Done."
