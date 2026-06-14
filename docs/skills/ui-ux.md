Skill: UI / UX Hardening
Objetivo
Mantener una interfaz clara, consistente y segura sin tocar lógica crítica.
---
Regla crítica
```txt
Cambios visuales NO deben cambiar lógica de negocio, auth, tracking, billing ni reportes.
Principios
No dejar pantallas en blanco.
Siempre mostrar loader, error o estado vacío.
No mostrar datos técnicos al usuario.
No mostrar tokens, user_id, org_id ni logs.
Botones deshabilitados deben explicar por qué.
Mantener lenguaje visual consistente.
Archivos típicos
src/pages/
src/components/
src/layouts/
src/i18n/
Estados obligatorios

Toda pantalla importante debe manejar:

loading
success
empty
error
retry
Botones

Reglas:

Texto claro.
Estado loading visible.
Estado disabled justificado.
No dejar acciones críticas disponibles dos veces.
Evitar doble submit.
Formularios

Reglas:

Validar campos requeridos.
Mostrar errores amigables.
No mostrar errores crudos del backend.
Mantener submit deshabilitado solo cuando corresponda.
i18n

Toda pantalla pública o visible al usuario debe usar traducciones.

Archivos:

src/i18n/es.json
src/i18n/en.json
src/i18n/fr.json

Reglas:

Mantener paridad entre idiomas.
No dejar placeholders.
No hardcodear textos nuevos si la pantalla ya usa i18n.
Debug visual

Prohibido mostrar en UI final:

token present
tracker_user_id
org_id
bridge ready
ENV_KIND
build marker
raw JSON
Pruebas obligatorias

Validar en preview:

página carga
no hay pantalla blanca
botones funcionan
disabled tiene explicación
errores son amigables
no hay datos técnicos visibles
mobile se ve usable
Bugfix tracking
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

Archivo: src/pages/TrackerGpsPage.jsx

Prompt:
Solo mejora UI. No cambies lógica, hooks, imports ni llamadas API.
No hacer
No tocar lógica durante hardening visual.
No remover validaciones.
No ocultar errores sin manejarlos.
No mostrar debug técnico.
No hardcodear textos si existe i18n.

Push:

```bash
git add docs/skills/ui-ux.md
git commit -m "docs: add ui ux skill [allow-docs]"
git push origin preview

## Estándar visual vigente — REPORTES

La referencia visual oficial para páginas internas es `Reports.jsx` / **REPORTES**.

Ver también:

```txt
docs/UI_STYLE_GUIDE.md
```
Reglas para hardening visual
Cambios visuales no deben tocar lógica de negocio, auth, tracking, billing, geofencing, SQL ni RLS.
Mantener header tipo REPORTES: gradiente emerald/teal, título, subtítulo y acciones claras.
Usar tarjetas y contenedores blancos con borde emerald suave, `rounded-3xl` y sombra ligera.
Usar botones primarios emerald y secundarios blancos con borde emerald.
Tablas con encabezado emerald claro, números alineados a la derecha y scroll horizontal si hay muchas columnas.
Filtros en paneles consistentes, con focus emerald y labels claros.
No mostrar datos técnicos: `org_id`, `user_id`, tokens, raw JSON, logs o marcadores de debug.
Mantener i18n ES/EN/FR cuando la pantalla lo use.
Validar mobile de forma básica antes de cerrar.
Páginas ya normalizadas
Inicio
Dashboard / Home
Reportes
Planificación
Benchmarking
Centro de Ayuda / Guía Rápida
Actividades
Asignaciones
Personal
Costos
Costos Dashboard
Tracker
Tracker Dashboard
Billing
Pricing
Invitar Tracker
Prompt corto para Copilot
```txt
Solo alinea esta página al estilo REPORTES. No cambies lógica, hooks, queries, auth, billing, tracking ni RLS. Mantén i18n y estados loading/error/empty.
```