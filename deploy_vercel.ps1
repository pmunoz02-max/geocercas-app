# deploy_vercel.ps1
# Vercel deploy helper (Git based)
# Encoding: ASCII safe

Write-Host "=== Detecting Git repository root ==="

try {
    $repoRoot = git rev-parse --show-toplevel 2>$null
    if (-not $repoRoot) {
        throw "Not a Git repository."
    }
} catch {
    Write-Error "ERROR: This directory is not a Git repository."
    exit 1
}

Set-Location $repoRoot
Write-Host "Repository: $repoRoot"
Write-Host ""

Write-Host "=== Current status (git status) ==="
git status
Write-Host ""

# Detect real changes
$changes = git status --porcelain

if (-not $changes) {
    Write-Host "INFO: No changes to commit."
    Write-Host "Nothing to push. Exiting."
    exit 0
}

$answer = Read-Host "Continue with add + commit + push? [s/N]"
if ($answer.ToLower() -ne "s") {
    Write-Host "Cancelled by user."
    exit 0
}

Write-Host ""
Write-Host "=== Adding files (git add .) ==="
git add .

Write-Host ""
Write-Host "=== Creating commit ==="
$commitMessage = "deploy: automatic update"

git commit -m $commitMessage

if ($LASTEXITCODE -ne 0) {
    Write-Error "ERROR: Commit failed."
    exit 1
}

Write-Host "Commit created successfully."
Write-Host ""

Write-Host "=== Detecting current branch ==="
$branch = git branch --show-current
Write-Host "Current branch: $branch"
Write-Host ""

Write-Host "=== Pushing to origin/$branch ==="
git push origin $branch

if ($LASTEXITCODE -ne 0) {
    Write-Error "ERROR: Push failed."
    exit 1
}

Write-Host ""
Write-Host "OK. Push sent to Git."
Write-Host "Vercel will pick up this commit and run the deploy."
