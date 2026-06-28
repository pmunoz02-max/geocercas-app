# DODO Change Plan Sync Org Billing Fix

Fecha: 28 junio 2026  
Branch: preview  
Ambiente: Supabase Preview  
Proyecto Supabase Preview: mujwsfhkocsuuahlrssn / pruebatugeo

## 1. Problema

El flujo PRO -> Enterprise usando Dodo Change Plan funcionaba correctamente a nivel de Dodo y webhook, pero la UI podía seguir mostrando PRO hasta que el usuario hacía reload manual.

Secuencia observada:

```text
PRO active
-> usuario confirma cambio a Enterprise
-> Dodo acepta Change Plan
-> la app navega a Billing
-> Billing lee org_billing antes de que el webhook termine
-> la UI todavía muestra PRO
-> reload manual posterior muestra Enterprise
```

## 2. Causa

La actualización definitiva de `org_billing` dependía del webhook `subscription.plan_changed`.

Aunque el webhook llegaba correctamente, había una ventana de tiempo en la que el frontend ya navegaba a Billing pero `org_billing` todavía no estaba sincronizado.

## 3. Cambio aplicado

Se actualizó:

```text
supabase/functions/dodo-create-checkout/index.ts
```

Después de que Dodo responde OK al endpoint `change-plan`, la Edge Function sincroniza inmediatamente `org_billing`.

Campos sincronizados:

```text
plan_code = enterprise
subscribed_plan_code = enterprise
plan_status = active
billing_provider = dodo
dodo_subscription_id = suscripción existente
dodo_product_id = producto Enterprise
last_dodo_event_at = now()
updated_at = now()
```

## 4. Resultado esperado

Después de confirmar el cambio PRO -> Enterprise:

```text
Dodo Change Plan se ejecuta.
La misma subscription_id se mantiene.
org_billing se actualiza inmediatamente.
Billing debe mostrar Enterprise sin reload manual.
El webhook posterior confirma el mismo estado.
No se crea segunda suscripción.
```

## 5. Seguridad

Este cambio se aplicó solo en Preview.

No se tocó Production.

No se hizo Promote.

No se modificó schema de base de datos.

No se modificaron secrets.

## 6. Validación esperada

Repetir flujo completo en Preview:

```text
FREE -> PRO TEST
PRO -> modal de confirmación Enterprise
Confirmar cambio
Billing muestra Enterprise automáticamente
Verificar dodo_webhook_events
Confirmar una sola subscription_id para PRO -> Enterprise
```

## 7. Nota técnica

El webhook sigue siendo la fuente confirmatoria final de eventos Dodo, pero la Edge Function actualiza `org_billing` inmediatamente después de una respuesta OK de Dodo Change Plan para evitar una mala experiencia de usuario por latencia del webhook.
