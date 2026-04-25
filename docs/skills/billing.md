# Skill: Billing & Paddle

## Objetivo
Mantener estable el flujo de suscripciones, planes, cancelaciones y cambios de estado usando Paddle sin romper la experiencia del usuario.

Este documento debe actualizarse cada vez que se corrija un bug relacionado con billing.

---

## Reglas operativas

- Trabajar solo en branch `preview`.
- No hacer push a `main`.
- No tocar producción salvo orden clara.
- No mezclar Paddle sandbox con producción.
- No cambiar lógica de billing sin revisar backend + frontend.

---

## Flujo billing esperado

1. Usuario entra a Billing.
2. App obtiene estado actual de suscripción.
3. Frontend muestra plan y acciones disponibles.
4. Usuario puede:
   - cambiar plan
   - suspender/cancelar
   - reactivar
5. Backend valida estado real en Paddle.
6. Backend ejecuta operación.
7. Frontend muestra resultado claro.

---

## Fuente de verdad

La fuente de verdad del estado de suscripción es:

```txt
Paddle
Ambientes
Sandbox

Usar solo en preview/testing.

PADDLE_ENV=sandbox
Producción

Usar solo en producción real.

PADDLE_ENV=production

Nunca cruzar datos sandbox con producción.

Error conocido: subscription_locked_pending_changes
Síntoma

Paddle responde:

subscription_locked_pending_changes

Mensaje típico:

cannot update subscription, pending scheduled changes
Causa raíz

Ya existe un cambio programado pendiente para esa suscripción.

Ejemplo:

usuario pidió suspender
luego intenta cancelar otra vez
Paddle bloquea segunda operación
Solución permanente

El backend debe detectar este error y devolver una respuesta controlada al frontend.

No debe mostrarse como error técnico crudo.

Respuesta recomendada:

{
  "ok": false,
  "code": "subscription_pending_changes",
  "message": "There is already a scheduled change for this subscription. Please wait before modifying the plan."
}
Regla crítica

Antes de intentar cancelar/suspender/cambiar plan:

Consultar estado actual de la suscripción.
Verificar si tiene cambios pendientes.
Si existen cambios pendientes:
no llamar update/cancel nuevamente
retornar mensaje controlado
mantener UI estable
Frontend

Archivos típicos:

src/pages/Billing.jsx
src/pages/BillingCancel.jsx
src/pages/BillingSuccess.jsx
src/components/ManageSubscriptionButton.jsx

Reglas:

No asumir que el botón siempre puede ejecutar acción.
Si backend responde subscription_pending_changes, mostrar mensaje claro.
No mostrar JSON técnico al usuario.
No dejar botón en loading infinito.
Deshabilitar acciones incompatibles si la suscripción ya tiene cambios pendientes.
Backend

Archivos típicos:

api/
supabase/functions/

Reglas:

Nunca confiar en estado enviado desde frontend.
Validar usuario.
Validar organización.
Validar subscription_id.
Consultar Paddle antes de modificar.
Manejar errores Paddle con códigos propios estables.
Estados relevantes

Estados posibles a considerar:

active
trialing
past_due
paused
canceled
scheduled_change_pending

La UI debe tener comportamiento claro para cada estado.

SQL antes de tocar billing local

Antes de modificar tablas relacionadas a billing:

select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name ilike '%billing%'
   or table_name ilike '%subscription%'
   or table_name ilike '%plan%'
order by table_name, ordinal_position;

Si hay duda, inspeccionar también organizaciones:

select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'organizations',
    'organization_members'
  )
order by table_name, ordinal_position;
Reglas de UX

El usuario nunca debe ver:

errores crudos de Paddle
request_id técnico
JSON completo
pantallas en blanco

Debe ver mensajes simples como:

Ya existe un cambio pendiente para esta suscripción. Espera a que se procese antes de modificar el plan nuevamente.
Bugfix tracking

Cada bug de billing debe agregarse así:

## Bugfix YYYY-MM-DD - nombre corto

### Síntoma
...

### Causa raíz
...

### Solución permanente
...

### Archivos modificados
- ...

### Prueba obligatoria
- ...
Pruebas obligatorias
Preview / Sandbox

Validar:

Billing carga sin errores.
Plan actual se muestra correctamente.
Botón suspend/cancel no queda congelado.
Error subscription_locked_pending_changes se maneja sin romper UI.
No se muestra JSON técnico al usuario.
Logs backend muestran respuesta controlada.
Producción

Solo tocar si hay orden explícita.

Regla Copilot

Cuando se use Copilot:

Abrir archivo específico.
Prompt corto.
Un cambio por paso.
Probar en preview.
Push.

Ejemplo:

Archivo: api/cancel-subscription.js

Prompt:
Maneja el error subscription_locked_pending_changes devolviendo code subscription_pending_changes sin cambiar la lógica existente.
No hacer
No mezclar sandbox con producción.
No mostrar errores técnicos de Paddle en UI.
No ejecutar cancel/update si ya hay cambios pendientes.
No asumir estado desde frontend.
No modificar billing junto con auth o tracking en el mismo cambio.
No hacer parches solo para una subscription_id.

Push corto:

```bash
git add docs/skills/billing.md
git commit -m "docs: add billing skill [allow-docs]"
git push origin preview