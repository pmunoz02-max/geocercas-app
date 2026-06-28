# DODO Change Plan Preview End-to-End Final Validation

Fecha: 28 junio 2026  
Branch: preview  
Ambiente: Supabase Preview  
Proyecto Supabase Preview: mujwsfhkocsuuahlrssn / pruebatugeo  
Producción: intacta

## 1. Objetivo

Documentar la validación final end-to-end del flujo Dodo TEST en Preview para el cambio de plan:

```text
FREE -> PRO TEST -> Enterprise mediante Dodo Change Plan
```

El objetivo principal fue confirmar que una organización con PRO activo pueda subir a Enterprise sin crear una segunda suscripción, usando el cambio directo de plan sobre la suscripción existente.

## 2. Regla operativa aplicada

Durante toda la validación se mantuvieron las reglas del proyecto:

```text
Branch operativo: preview
No push a main
No Promote a Production
No tocar Supabase Production
No mezclar Preview con Producción
No subir datos demo a Producción
No pegar secrets en el chat
```

## 3. Organización de prueba

Organización utilizada en Supabase Preview:

```text
org_id: f0f185ae-e6d1-4045-9e4b-372a5b7b471a
Nombre visible: DEMO Agro Preview
```

Esta organización fue usada únicamente para pruebas en Preview.

## 4. Preparación de la prueba

Para repetir el flujo completo, la organización se bajó manualmente a FREE en Supabase Preview mediante SQL controlado.

Se actualizaron las fuentes relevantes:

```text
public.org_billing
public.organizations
```

No se actualizó `public.org_entitlements` porque se confirmó que es una vista construida desde:

```text
org_billing + plan_limits
```

Por lo tanto, al cambiar `org_billing.plan_code`, `org_entitlements` se recalcula automáticamente.

Estado esperado después del downgrade controlado:

```text
org_billing.plan_code = free
org_billing.subscribed_plan_code = free
org_billing.plan_status = inactive
org_billing.billing_provider = null
organizations.plan = free
org_entitlements.plan_code = free
org_entitlements.max_geocercas = 5
org_entitlements.max_trackers = 1
```

## 5. Flujo validado

Se validó el siguiente flujo completo:

```text
1. Organización en FREE.
2. App Preview muestra Plan actual: Free.
3. Usuario presiona Suscribirme a PRO.
4. Se abre Dodo Checkout TEST.
5. Pago PRO TEST exitoso.
6. Webhook Dodo actualiza org_billing a PRO active.
7. App muestra PRO activo.
8. Usuario presiona Subir a Enterprise.
9. App muestra modal de confirmación interno.
10. Usuario confirma el cambio.
11. Edge Function ejecuta Dodo Change Plan.
12. Edge Function sincroniza org_billing a Enterprise active inmediatamente.
13. Webhook Dodo posterior confirma el cambio.
14. App muestra Enterprise automáticamente, sin reload manual.
```

## 6. Validación Dodo Change Plan

El comportamiento esperado para PRO -> Enterprise quedó confirmado:

```text
No se abre un segundo checkout Dodo.
No se crea una segunda suscripción para el upgrade.
Dodo usa la suscripción existente.
Dodo emite subscription.plan_changed.
org_billing queda Enterprise active.
```

Se observaron pruebas con la misma `subscription_id` pasando de producto PRO a producto Enterprise.

Ejemplo de eventos validados:

```text
subscription.active        -> producto PRO
subscription.updated       -> producto PRO
payment.succeeded          -> pago PRO
subscription.plan_changed  -> producto Enterprise
```

El evento decisivo para Enterprise fue:

```text
subscription.plan_changed -> processed / activated
```

## 7. Control contra doble suscripción

Se validó que, dentro de cada prueba PRO -> Enterprise, el cambio ocurrió sobre la misma `subscription_id`.

Ejemplos observados en Preview:

```text
sub_0Ni2p99F0x2ABDYCBH9vl
PRO product -> Enterprise product

sub_0Ni2ypbKg5HRqw8z0xx9w
PRO product -> Enterprise product
```

Esto confirma que el flujo de upgrade no abrió una segunda suscripción Enterprise para la misma compra.

## 8. Eventos conflictivos protegidos

Durante una prueba se observó un evento `payment.succeeded` con estado:

```text
ignored
```

y detalle:

```text
payment_metadata_plan_conflicts_existing_subscription_product
```

Este comportamiento es correcto: el webhook protegió `org_billing` contra un evento ambiguo posterior al cambio de producto. El evento determinante `subscription.plan_changed` fue procesado correctamente.

## 9. Fixes aplicados durante la validación

### 9.1 Ocultar proveedor de pago en UI

Se ocultó el texto visual:

```text
Provider: DODO
```

El proveedor sigue disponible internamente para la lógica de billing, pero no se muestra al usuario final.

### 9.2 Fallback FREE para organizaciones sin billing confirmado

Se corrigió el comportamiento para que, si no existe billing/entitlements válido, la organización no aparezca como PRO por fallback.

Regla final:

```text
Sin org_billing activo confirmado
+ sin org_entitlements válido
= Free
```

### 9.3 Bypass tracker limitado a rutas tracker

El bypass de tracker ya no fuerza PRO en pantallas generales como Inicio, Billing o Pricing.

Regla final:

```text
Bypass tracker solo en rutas /tracker o /tracker-gps
```

### 9.4 Confirmación interna antes de Change Plan

Se agregó modal de confirmación antes de ejecutar PRO -> Enterprise.

El usuario ve un mensaje indicando que:

```text
La organización cambiará a Enterprise.
Dodo usará el método de pago asociado a la suscripción actual.
No se creará una segunda suscripción.
```

### 9.5 Sincronización inmediata de org_billing

Se corrigió el problema donde la UI requería reload manual para mostrar Enterprise.

Nuevo comportamiento:

```text
Dodo Change Plan OK
-> Edge Function actualiza org_billing a Enterprise active inmediatamente
-> UI muestra Enterprise sin reload manual
-> webhook posterior confirma el mismo estado
```

## 10. Archivos relevantes modificados

Durante esta etapa se trabajaron principalmente estos archivos:

```text
supabase/functions/dodo-create-checkout/index.ts
src/components/Billing/UpgradeToProButton.tsx
src/hooks/useOrgEntitlements.js
src/pages/Inicio.jsx
```

Documentos relacionados creados o actualizados:

```text
DODO_PRO_TO_ENTERPRISE_CHANGE_PLAN_STRATEGY.md
DODO_CHANGE_PLAN_FUNCTION_PREVIEW_VALIDATION.md
DODO_CHANGE_PLAN_NON_2XX_UX_FIX.md
DODO_CHANGE_PLAN_CONFIRMATION_MODAL.md
DODO_CHANGE_PLAN_REFRESH_UX_FIX.md
DODO_CHANGE_PLAN_AUTO_REFRESH_FINAL_FIX.md
DODO_CHANGE_PLAN_SYNC_ORG_BILLING_FIX.md
MONETIZATION_FREE_FALLBACK_TRACKER_BYPASS_FIX.md
MONETIZATION_HOME_FREE_FALLBACK_FIX.md
```

## 11. Estado final validado en Preview

Resultado final:

```text
FREE visible: OK
PRO TEST checkout: OK
PRO webhook: OK
PRO active visible: OK
Modal Enterprise: OK
Change Plan Dodo: OK
org_billing sync inmediato: OK
Enterprise visible sin reload manual: OK
Webhook posterior: OK
Sin segunda subscription_id para el upgrade: OK
Producción intacta: OK
Promote no realizado: OK
```

## 12. Pendiente antes de Producción

Antes de llevar este flujo a Producción se requiere checklist separado:

```text
1. Auditar Production read-only.
2. Comparar schema Preview vs Production.
3. Preparar SQL Production exacto.
4. Configurar productos Dodo LIVE.
5. Configurar DODO_API_KEY_LIVE.
6. Configurar DODO_WEBHOOK_SECRET_LIVE.
7. Crear webhook LIVE apuntando a Production.
8. Desplegar Edge Functions a Production solo con orden expresa.
9. Probar pago LIVE con monto/control definido.
10. Documentar todo en /docs.
```

## 13. Prohibiciones vigentes

Hasta orden expresa:

```text
No hacer Promote a Production.
No tocar Supabase Production.
No hacer push a main.
No configurar secrets LIVE en el chat.
No usar datos demo en Producción.
```

## 14. Conclusión

El flujo Dodo TEST en Supabase Preview queda validado end-to-end para:

```text
FREE -> PRO TEST -> Enterprise mediante Change Plan
```

La implementación actual evita doble suscripción en el upgrade PRO -> Enterprise, muestra confirmación previa al usuario, sincroniza `org_billing` de inmediato después de que Dodo acepta el cambio y mantiene Production intacta.
