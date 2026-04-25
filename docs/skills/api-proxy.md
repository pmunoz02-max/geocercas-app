# Skill: API Proxy (Vercel → Supabase)

## Objetivo
Garantizar que todas las llamadas desde frontend hacia backend pasen de forma controlada, trazable y consistente mediante endpoints `/api/*`.

---

## Regla crítica

```txt
TODO request crítico debe pasar por /api/*
No llamar Supabase directamente desde frontend para:

tracking
billing
operaciones sensibles
Flujo correcto
Frontend llama:
/api/send-position
Vercel recibe request
Endpoint procesa o valida
Reenvía a Supabase (Edge Function o REST)
Retorna respuesta controlada al frontend
Logs obligatorios

Cada endpoint debe tener:

[api/<endpoint>] start
[api/<endpoint>] proxy_start
[api/<endpoint>] proxy_end
[api/<endpoint>] end

Ejemplo real:

[api/send-position] proxy_start
[api/send-position] proxy_end
Regla de trazabilidad

Cada request debe permitir:

saber si llegó a Vercel
saber si salió hacia Supabase
saber si volvió

Si no hay logs → no existe trazabilidad → bug difícil

Headers

Pasar siempre:

Authorization: Bearer <access_token>
Content-Type: application/json

Nunca confiar en datos sin token.

Validaciones mínimas

En cada endpoint:

Validar método (POST/GET)
Validar body
Validar token
Validar campos obligatorios
Manejar errores
Manejo de errores

Nunca devolver errores crudos.

Formato estándar:

{
  "ok": false,
  "error": "error_code",
  "message": "mensaje claro"
}
Timeout / fallback

Regla:

no dejar requests colgados
manejar timeout si Supabase no responde
devolver error controlado
Archivos típicos
api/send-position.js
api/*
Pruebas obligatorias

Validar en preview:

endpoint responde OK
logs aparecen en Vercel
Supabase recibe request
frontend recibe respuesta
errores no rompen UI
Bugfix tracking

Formato:

## Bugfix YYYY-MM-DD - nombre

### Síntoma
...

### Causa raíz
...

### Solución permanente
...

### Archivos modificados
- ...

### Prueba
- ...
Regla Copilot

Ejemplo:

Archivo: api/send-position.js

Prompt:
Agrega logs proxy_start y proxy_end sin cambiar la lógica existente.
No hacer
no llamar Supabase directo desde frontend para lógica crítica
no omitir logs
no devolver errores crudos
no dejar requests sin respuesta
no mezclar múltiples responsabilidades en un endpoint

---

## 🚀 Push corto

```bash
git add docs/skills/api-proxy.md
git commit -m "docs: add api proxy skill [allow-docs]"
git push origin preview