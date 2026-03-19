# Sistema de Billing

App Geocercas funciona como SaaS.

## Tecnología

- Stripe

## Planes

Ejemplo:
- Free
# Billing — Capa de Lectura Canónica

App Geocercas funciona como SaaS multi-tenant. Este documento describe la
arquitectura de datos del panel de monetización tras la unificación de
la capa de lectura (migración `20260319000100_billing_panel_unification`).

---

## Principio fundamental

> No usar `organizations.plan` como fuente de decisiones comerciales.
> La fuente canónica es `org_billing` + `resolve_effective_plan_code`.

---

## Objetos del sistema de billing

### `public.org_billing` — estado comercial

Tabla base. Una fila por organización. Registra:

| Columna | Descripción |
|---|---|
| `org_id` | FK → organizations.id |
| `plan_code` | Plan base registrado (fallback) |
| `subscribed_plan_code` | Plan según suscripción activa (Stripe) |
| `plan_status` | Estado del ciclo: `active`, `trialing`, `past_due`, `canceled`, `paused` |
| `tracker_limit_override` | Override manual del límite de trackers (prevalece sobre el plan) |
| `stripe_customer_id` | ID de cliente en Stripe |
| `stripe_subscription_id` | ID de suscripción en Stripe |
| `stripe_price_id` | ID de precio en Stripe |
| `current_period_end` | Fin del período de facturación actual |
| `trial_start` / `trial_end` | Ventana de período de prueba |
| `over_limit` | Flag pre-computado de exceso de límite |
| `over_limit_reason` | Razón del exceso |
| `over_limit_checked_at` | Última vez que se verificó el enforcement |

---

### `public.resolve_effective_plan_code(plan_code, plan_status)` — plan efectivo

Función canónica. Recibe el plan deseado y el estado de pago; devuelve el plan
que realmente se aplica.

```
active   → plan contratado
trialing → plan contratado (trial vigente)
past_due → plan contratado (período de gracia)
canceled | paused | NULL → 'starter'
```

Usada así en las vistas:

```sql
resolve_effective_plan_code(
  coalesce(subscribed_plan_code, plan_code),
  plan_status
)
```

---

### `public.org_billing_effective` — vista extendida

Extiende `org_billing` con la columna `effective_plan_code` calculada por
`resolve_effective_plan_code`. Es la fuente intermedia usada por
`org_entitlements` y `v_billing_panel`.

---

### `public.org_entitlements` — límites efectivos

Vista que resuelve los límites reales de la organización:

- Lee `effective_plan_code` desde `org_billing_effective`
- Busca límites primero en `plan_limits`, fallback en `plans`
- Aplica `tracker_limit_override` cuando está definido

| Columna | Descripción |
|---|---|
| `max_geocercas` | Límite de geocercas para el plan efectivo |
| `max_trackers` | Límite de trackers (con override aplicado) |

**Enforcement**: `enforce_geocercas_limit()` lee esta vista.
**Función**: `effective_tracker_limit(uuid)` lee esta vista.

---

### `public.v_org_kpis` — uso actual

Métricas de uso por organización:
- `active_tracker_count` — trackers activos (memberships con `role=tracker`)
- `active_geocercas_count` — geocercas activas

---

### `public.v_billing_panel` — panel unificado (fuente para UI)

Vista maestra que combina:
- `organizations` — identidad
- `org_billing_effective` — estado comercial y plan efectivo
- `org_entitlements` — límites calculados
- `v_org_kpis` — uso actual

Columnas destacadas:

| Columna | Descripción |
|---|---|
| `effective_plan_code` | Plan real aplicado (canonizado) |
| `plan_status` | Estado de la suscripción |
| `max_trackers` / `max_geocercas` | Límites efectivos |
| `active_tracker_count` / `active_geocercas_count` | Uso actual |
| `is_over_tracker_limit` | `true` si uso ≥ límite |
| `tracker_usage_pct` / `geocercas_usage_pct` | Porcentaje de uso (0–100) |

---

## Funciones de consulta

### `effective_tracker_limit(org_id uuid) → integer`
Lee `max_trackers` desde `org_entitlements`. Fallback a 1 si la org no tiene
registro en `org_billing`.

### `get_org_limits(org_id uuid) → jsonb`
Devuelve JSON completo con plan, `effective_plan_code`, `plan_status`, límites,
`over_limit`, `over_limit_reason` y fechas de trial. Uso: UI y reporting.

---

## Reglas

1. **Nunca** usar `organizations.plan` para decisiones de limits/features.
2. **Siempre** usar `effective_plan_code` de `org_entitlements` o `v_billing_panel`.
3. `tracker_limit_override` prevalece sobre cualquier límite de plan.
4. `resolve_effective_plan_code` es la única lógica de canonización de plan.
5. `v_billing_panel` es la única fuente de verdad para la UI del panel.

---

## Flujo de actualización de billing (Stripe)

```
Stripe webhook
  ↓
apply_stripe_subscription_to_org_billing (RPC)
  ↓ actualiza org_billing (plan_status, subscribed_plan_code, stripe_*)
  ↓
org_billing_effective recalcula effective_plan_code automáticamente
  ↓
org_entitlements refleja nuevos límites
  ↓
UI lee v_billing_panel sin lógica adicional
```

---

## Migración de referencia

`supabase/migrations/20260319000100_billing_panel_unification.sql`

Scope: **solo preview**. No aplicar en producción hasta validación completa.

---

## Contrato Frontend (Preview)

Reglas operativas para el panel de monetizacion (`/billing` y `/pricing`):

1. Organizacion activa: usar unicamente `AuthContext.currentOrgId`.
2. Permisos UI: usar unicamente `AuthContext.isAdmin`.
3. Fuente comercial: leer estado comercial solo desde `public.v_billing_panel`.
4. No usar `organizations.plan` para decisiones de planes, limites o estado.
5. Ocultar panel para perfiles sin permisos de gestion (`tracker` / `viewer`).

Tarjetas minimas del panel:
- Plan efectivo (`effective_plan_code`)
- Estado (`plan_status`)
- Trial (`trial_end`)
- Limites (`max_trackers`, `max_geocercas`)
- Consumo (`active_tracker_count`, `active_geocercas_count`, `% uso`)

Nota de despliegue:
- Este contrato aplica a preview.
- No promover a produccion hasta validacion funcional y de RLS en entorno preview.

---

## Edge Cases Detectados (QA Preview 2026-03-19)

1. En Pricing, si falla la lectura de `v_billing_panel` o no hay fila cargada, el estado UI ahora usa `unknown`.
Render esperado: `Sin datos comerciales` (ya no cae a `active` por fallback).

2. En Billing, limites ahora distinguen:
- `null`/`undefined` => `—`
- `0` => `0`
- `>0` => valor numerico / `Unlimited` segun corresponda.

3. En barras de consumo, cuando faltan datos (KPI, limite o porcentaje), la UI ya no muestra `0.0%`.
Render esperado: etiqueta `Sin datos` + barra neutra (gris).
Solo se muestra porcentaje numerico cuando el dato es real.

4. En Pricing se ejecuta `useOrgEntitlements` incluso para usuarios sin permiso de monetizacion; la pantalla igual se bloquea por `isAdmin`.
Impacto: no expone panel ni acciones, pero hay trabajo de datos innecesario hasta retornar vista de acceso denegado.

---

## Hardening UI Preview (2026-03-19)

Ajustes minimos aplicados sin impacto en produccion:

1. `Pricing`:
- Fallback de estado comercial cambiado de `active` a `unknown`.
- Etiqueta segura para `unknown`: `Sin datos comerciales`.

2. `Billing` limites:
- `formatLimit` ahora separa ausencia de dato (`—`) de limite cero (`0`).

3. `Billing` consumo:
- Si faltan datos para consumo, muestra `Sin datos` y barra neutra.
- Evita renderizar `0.0%` cuando el porcentaje no existe.

4. Fuentes canonicas preservadas:
- Org activa: `AuthContext.currentOrgId`.
- Permisos UI: `AuthContext.isAdmin`.
- Estado comercial: `public.v_billing_panel`.

---

## Conversion UX Preview (2026-03-19)

Estados de consumo calculados en `Billing`:

1. `warning`:
- `usage_pct >= 80` y `< 100`.

2. `critical`:
- `usage_pct >= 100`, o
- `billing_over_limit = true`.

3. `unknown`:
- falta alguno de los datos (`current`, `limit`, `usage_pct`).
- UI muestra `Sin datos` y barra neutra.

Banner de exceso (`over_limit`):
- Se muestra en forma destacada cuando `billing_over_limit = true`.
- Usa `over_limit_reason` como mensaje principal cuando esta disponible.

CTA contextual de upgrade:

1. Plan `free`/`starter`:
- CTA principal a `/pricing`.

2. Estado `trialing`:
- CTA para convertir antes del vencimiento.
- Incluye countdown de trial cuando existe `trial_end`.

3. Estado `over_limit`:
- CTA prioritario de upgrade + acceso a `/pricing`.

Notas de seguridad de datos:
- Si falta `plan_status`, se usa estado `unknown` y texto seguro (`Sin datos comerciales`).
- Se mantiene `v_billing_panel` como fuente unica de datos comerciales.
- No usar `organizations.plan`.

---

## Preview - Monetizacion y contexto de organizacion

Resumen tecnico y funcional del bloque completado (solo preview).

### Fuentes canonicas vigentes

1. Org activa unica: `AuthContext.currentOrgId`.
2. Permiso UI monetizacion: `AuthContext.isAdmin`.
3. Lectura comercial del panel: `public.v_billing_panel`.
4. Regla explicita: no usar `organizations.plan` para decisiones de monetizacion.

### Cambios implementados

1. `accept_invitation` endurecido para no degradar `owner/admin` cuando se acepta invite tracker en la misma org.
2. `accept-tracker-invite` (legacy compat) ajustado para no pisar roles altos existentes.
3. `OrgSelector` oculto cuando el usuario tiene una sola org activa.
4. `Billing` refactorizado para leer solo `v_billing_panel`.
5. `Pricing` alineado a `currentOrgId` e `isAdmin`.
6. `ProtectedShell` alineado con `isAdmin` canonico.

### UX actual de Billing (preview)

1. Tarjetas: plan, estado, trial, limites y consumo.
2. Severidad de consumo:
- `warning`: `usage_pct >= 80` y `< 100`.
- `critical`: `usage_pct >= 100` o `billing_over_limit = true`.
- `unknown`: faltan datos de consumo; render neutro.
3. Banner `over_limit` visible con `over_limit_reason` cuando existe.
4. CTA contextual:
- `free/starter`: ir a `Pricing`.
- `trialing`: CTA para convertir antes del vencimiento.
- `over_limit`: CTA prioritario de upgrade.
5. Countdown de trial cuando `plan_status = trialing` y existe `trial_end`.
6. Null safety aplicado a `trial_end`, `current_period_end`, limites y consumo.

### Edge cases conocidos en preview

1. `Pricing` aun ejecuta `useOrgEntitlements` antes del guard visual de `isAdmin`.
2. Si faltan datos comerciales, la UI usa estado neutral `unknown` y textos seguros (`Sin datos`, `Sin datos comerciales`).

### Checklist de validacion manual (preview)

1. Owner/Admin con una org: panel visible, selector oculto, datos comerciales cargan.
2. Owner/Admin multi-org: cambiar org refresca `Billing` y `Pricing` por `currentOrgId`.
3. Tracker/Viewer: monetizacion bloqueada por `isAdmin`.
4. Org `trialing`: banner/countdown y CTA de conversion visibles.
5. Org `over_limit`: banner critico con razon + CTA prioritario.
6. Cambio de org consecutivo: no quedan datos stale entre organizaciones.

### Nota obligatoria

- Estos cambios pertenecen solo a preview.
- No promover a produccion sin validacion visual y funcional.

---

## Hotfix de produccion - Billing y org context

Resumen del fix defensivo aplicado en produccion, separado de la arquitectura nueva de preview.

### Ajuste aplicado en org context

Se corrigio un callsite frontend de `set_current_org` para usar el payload correcto de la funcion existente en produccion:

- Firma valida en produccion: `set_current_org(p_org uuid)`
- Compatibilidad legacy preservada: `rpc_set_current_org(p_org_id uuid)`

Regla aplicada en el hotfix:
- si el frontend llama `set_current_org`, debe enviar `p_org`
- el fallback legacy a `rpc_set_current_org({ p_org_id })` se mantiene sin cambios

### Ajuste aplicado en Billing

El boton `Administrar suscripcion` quedo deshabilitado en produccion.

Motivo:
- la edge function de portal no existe todavia en produccion
- el frontend la estaba invocando como si estuviera disponible

Comportamiento actual:
- el boton no rompe la pagina
- se muestra un mensaje seguro de indisponibilidad
- se evita la invocacion de una function inexistente

### Alcance y limites del hotfix

Este cambio:

1. No toca SQL.
2. No introduce `v_billing_panel`.
3. No migra la arquitectura preview a produccion.
4. No cambia el modelo de billing productivo actual.

### Impacto esperado

1. Elimina el `404` causado por payload incorrecto en `set_current_org`.
2. Evita el `500` por invocacion de portal inexistente.
3. Mantiene `Billing` operativo con degradacion segura.

### Seguimiento requerido

Reactivar el portal solo cuando existan en produccion:

1. backend / edge function productiva para portal
2. secrets y variables de entorno validados
3. prueba funcional completa del flujo de administracion de suscripcion