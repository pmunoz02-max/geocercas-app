#!/usr/bin/env bash
set -e

# ==============================
# Script de deploy a Vercel vía Git
# - Hace add, commit y push al branch actual
# - Vercel toma el push y hace el deploy
# ==============================

# Mensaje de commit (puedes pasar uno como argumento)
COMMIT_MESSAGE=${1:-"chore: update asignaciones local time"}

echo "=== Detectando raíz del repositorio Git ==="
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

echo "Repositorio: $REPO_ROOT"
echo

echo "=== Estado actual (git status) ==="
git status
echo

# Confirmación interactiva
read -p "¿Continuar con add + commit + push? [s/N] " -r
if [[ ! $REPLY =~ ^[sS]$ ]]; then
  echo "Operación cancelada."
  exit 0
fi

echo
echo "=== Agregando archivos (git add .) ==="
git add .

echo "=== Haciendo commit ==="
if git commit -m "$COMMIT_MESSAGE"; then
  echo "Commit creado correctamente."
else
  echo "No hay cambios para commitear (git commit no creó nada)."
fi

echo
echo "=== Detectando branch actual ==="
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Branch actual: $CURRENT_BRANCH"
echo

echo "=== Haciendo push a origin/$CURRENT_BRANCH ==="
git push origin "$CURRENT_BRANCH"

echo
echo "✅ Listo. Push enviado a Git."
echo "   Vercel tomará este push y hará el deploy según la configuración de tu proyecto."
