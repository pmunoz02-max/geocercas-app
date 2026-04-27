# Copilot + Deploy Workflow — Geocercas

## Regla base

Nunca trabajar directo en `main`.

Flujo obligatorio:

preview → push → Vercel Preview → prueba → promote solo si se ordena

---

## 1. Workflow correcto

### Paso 1 — Diseñar con ChatGPT

Antes de tocar código:

- explicar bug o mejora
- revisar impacto
- definir archivo exacto
- crear prompt corto para Copilot

Copilot no decide arquitectura.

---

### Paso 2 — Ejecutar con Copilot

Copilot solo debe hacer cambios pequeños.

Formato obligatorio:

Archivo abierto:
`ruta/del/archivo`

Prompt:
`hacer solo este cambio puntual`

---

### Paso 3 — Revisar local

Comandos mínimos:

```bash
npm run build
Si aplica:

npm run lint