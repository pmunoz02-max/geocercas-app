# tools\fix-es-json-concat.ps1
# Detecta JSON concatenado en src/i18n/es.json (dos objetos root seguidos)
# y los mergea en uno solo (deep merge). Compatible CRLF/LF y variaciones de espacios.

$ErrorActionPreference = "Stop"

function DeepMerge($target, $source) {
  foreach ($k in $source.PSObject.Properties.Name) {
    $sv = $source.$k
    $tv = $target.$k

    $isSourceObj = $sv -is [pscustomobject]
    $isTargetObj = $tv -is [pscustomobject]

    if ($isSourceObj -and $isTargetObj) {
      DeepMerge -target $tv -source $sv | Out-Null
      $target.$k = $tv
    } else {
      $target.$k = $sv
    }
  }
  return $target
}

$path = "src/i18n/es.json"
if (!(Test-Path $path)) { throw "No existe: $path" }

$text = Get-Content $path -Raw -Encoding UTF8

# Split robusto: busca el inicio del segundo JSON que arranca con {"help": ...}
# Soporta CRLF/LF e indentación variable.
$pattern = "(\r?\n)\{\s*(\r?\n)\s*`"help`"\s*:"
$m = [regex]::Match($text, $pattern)

if (-not $m.Success) {
  Write-Host "No se detectó JSON concatenado. Igual se valida que el JSON parsea..."
  $obj = $text | ConvertFrom-Json
  ($obj | ConvertTo-Json -Depth 60) | Set-Content $path -Encoding UTF8
  Write-Host "OK: JSON válido re-serializado."
  exit 0
}

$idx = $m.Index
$first = $text.Substring(0, $idx).Trim()
$second = $text.Substring($idx).Trim()

# Parsear ambos objetos root
$o1 = $first | ConvertFrom-Json
$o2 = $second | ConvertFrom-Json

# Merge: o2 sobre o1
$merged = DeepMerge -target $o1 -source $o2

# Guardar bonito y válido
($merged | ConvertTo-Json -Depth 60) | Set-Content $path -Encoding UTF8

Write-Host "FIXED: JSON concatenado detectado y mergeado en $path"
