# DODO Change Plan Refresh UX Fix

Fecha: 28 junio 2026  
Branch: preview  
Ambiente: Supabase Preview / Vercel Preview

## 1. Objetivo

Evitar que el usuario tenga que hacer reload manual después de confirmar el cambio directo de PRO a Enterprise.

El flujo técnico ya estaba funcionando: Dodo ejecutaba `subscription.plan_changed`, el webhook actualizaba `org_billing` a Enterprise y no se creaba una segunda suscripción. Sin embargo, la pantalla podía quedarse momentáneamente en PRO o requerir recarga manual.

## 2. Archivo actualizado

```text
src/components/Billing/UpgradeToProButton.tsx
```

## 3. Cambio aplicado

Después de confirmar el cambio a Enterprise, el botón ahora espera brevemente a que `org_billing` refleje:

```text
plan_code/subscribed_plan_code = enterprise
plan_status = active/trialing/past_due/paused
```

Luego redirige a Billing con un parámetro `billing_refresh` para forzar una lectura fresca del estado.

## 4. Comportamiento esperado

```text
FREE -> PRO
abre Dodo Checkout normal.

PRO active -> Enterprise
muestra modal de confirmación.
Confirmar cambio ejecuta Dodo Change Plan.
La UI espera la actualización de org_billing.
La app navega a Billing mostrando Enterprise sin reload manual.

Enterprise active
no muestra una nueva compra.
```

## 5. Validación previa

Se validó en Preview que PRO y Enterprise quedan sobre la misma `subscription_id`:

```text
subscription.active      -> producto PRO
subscription.plan_changed -> producto Enterprise
```

No se creó una segunda suscripción para el mismo upgrade.

## 6. Seguridad

No se tocó Production.
No se hizo Promote.
No se cambiaron secrets.
No se modificó schema de base de datos.

## 7. Validación requerida

Repetir en Preview:

```text
1. Volver org de prueba a FREE.
2. Comprar PRO TEST.
3. Confirmar que Inicio/Billing muestran PRO.
4. Clic Subir a Enterprise.
5. Ver modal de confirmación.
6. Confirmar cambio.
7. La app debe mostrar Enterprise sin reload manual.
8. Confirmar una sola subscription_id para el upgrade.
```
