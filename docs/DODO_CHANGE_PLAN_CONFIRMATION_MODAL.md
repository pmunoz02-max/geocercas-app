# DODO Change Plan Confirmation Modal

Fecha: 28 junio 2026  
Branch: preview  
Ambiente: Supabase Preview / Vercel Preview

## 1. Objetivo

Agregar una confirmación visible antes de ejecutar el cambio directo de plan de PRO a Enterprise.

El cambio técnico de Dodo `change-plan` ya fue validado en Preview. El flujo confirmó que PRO y Enterprise quedan sobre la misma `subscription_id`, sin crear una segunda suscripción.

## 2. Motivo

El flujo PRO -> Enterprise mediante `change-plan` no abre Dodo Checkout. Dodo usa el método de pago asociado a la suscripción existente.

Técnicamente esto evita doble suscripción, pero para el usuario puede sentirse como un cambio silencioso si el plan Enterprise se activa sin una pantalla de confirmación.

## 3. Archivo actualizado

```text
src/components/Billing/UpgradeToProButton.tsx
```

## 4. Nuevo comportamiento

```text
FREE / inactive -> PRO
abre Dodo Checkout normal.

FREE / inactive -> Enterprise
mantiene checkout normal si el flujo lo permite.

PRO active -> Enterprise
muestra un modal de confirmación dentro de la app antes de llamar la Edge Function.

Enterprise active
no debe mostrar botón de compra adicional desde las pantallas de Billing/Inicio.
```

## 5. Modal de confirmación

El modal informa:

```text
La organización cambiará de PRO a Enterprise.
Dodo usará el método de pago asociado a la suscripción actual.
No se creará una segunda suscripción.
Nuevo plan: Enterprise.
Precio: USD 99 / month.
```

El usuario puede cancelar o confirmar el cambio.

## 6. Seguridad funcional

El botón consulta `org_billing` antes de mostrar el modal.

El modal solo se muestra cuando:

```text
requested_plan = enterprise
current plan = pro
current status = active/trialing/past_due/paused
```

Después de confirmar, la función `dodo-create-checkout` ejecuta el flujo ya validado de Change Plan.

## 7. Validación previa

Se validaron dos pruebas completas en Preview:

```text
FREE -> PRO TEST -> Enterprise
```

En ambas, Dodo mantuvo una sola `subscription_id` para PRO y Enterprise.

Eventos esperados:

```text
subscription.active
subscription.updated
subscription.renewed
payment.succeeded
subscription.plan_changed
```

El evento decisivo para Enterprise es:

```text
subscription.plan_changed -> Enterprise -> processed / activated
```

## 8. Producción

Production no fue tocada.

No se hizo Promote.

Antes de pasar a Producción debe validarse nuevamente en Preview que:

```text
PRO active -> clic Subir a Enterprise -> modal visible
Cancelar -> no cambia plan
Confirmar cambio -> Enterprise active
No se crea segunda subscription_id para el mismo upgrade
No aparece error rojo falso
```
