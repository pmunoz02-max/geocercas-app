# tools\fix-es-json-concat.ps1
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
$text = Get-Content $path -Raw -Encoding UTF8

# Encuentra el inicio del 2do JSON (línea que empieza con { y luego "help":)
$pattern = "(\r?\n)\{\s*(\r?\n)\s*`"help`"\s*:"
$m = [regex]::Match($text, $pattern)

if (-not $m.Success) { throw "No encontré el segundo JSON. Revisa si cambió el patrón." }

$idx = $m.Index
$first = $text.Substring(0, $idx).Trim()
$second = $text.Substring($idx).Trim()

$o1 = $first | ConvertFrom-Json
$o2 = $second | ConvertFrom-Json

$merged = DeepMerge -target $o1 -source $o2
($merged | ConvertTo-Json -Depth 60) | Set-Content $path -Encoding UTF8

Write-Host "OK: es.json reparado (2 JSON -> 1 JSON)"
