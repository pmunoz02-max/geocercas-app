# tools/fix_supabase_envcheck.ps1
$ErrorActionPreference = "Stop"

$files = git grep -l "\[ENV CHECK\]" -- src | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }

foreach ($f in $files) {
  if ($f -eq "src/lib/supabaseClient.js") {
    continue
  }

  # calcula ruta relativa hacia src/lib/supabaseClient.js
  $dir = Split-Path $f
  $rel = Resolve-Path -Relative (Join-Path $dir "../lib/supabaseClient.js") -ErrorAction SilentlyContinue
  if (-not $rel) {
    $rel = Resolve-Path -Relative (Join-Path $dir "../../lib/supabaseClient.js") -ErrorAction SilentlyContinue
  }
  if (-not $rel) {
    $rel = Resolve-Path -Relative (Join-Path $dir "../../../lib/supabaseClient.js") -ErrorAction SilentlyContinue
  }
  if (-not $rel) {
    # fallback: assume from src root
    $rel = "../lib/supabaseClient.js"
  }

  $content = @"
 // AUTO-FIX: shim único sin logs
 export * from "$rel";
 export { supabase as default, supabase } from "$rel";
"@

  Set-Content -Path $f -Value $content -Encoding UTF8
  Write-Host "Fixed ENV CHECK file -> $f (re-export $rel)"
}

Write-Host "Done."
