# DODO Change Plan Non-2xx UX Fix

Fecha: 28 junio 2026  
Branch: preview  
Ambiente: Supabase Preview / Vercel Preview

## 1. Contexto

Se validó el flujo completo en Preview:

```text
FREE -> PRO TEST -> Enterprise
```

Después de comprar PRO TEST y luego subir a Enterprise, la UI mostró temporalmente:

```text
Edge Function returned a non-2xx status code
```

Sin embargo, después de recargar la app, el plan quedó correctamente como Enterprise.

## 2. Validación de base de datos

La organización de prueba terminó en:

```text
plan_code: enterprise
subscribed_plan_code: enterprise
plan_status: active
billing_provider: dodo
```

Los eventos Dodo mostraron una sola suscripción:

```text
sub_0Ni2p99F0x2ABDYCBH9vl
```

Primero asociada al producto PRO:

```text
pdt_0NhoMPN43aL0XnHSZhrTk
```

Luego cambiada al producto Enterprise:

```text
pdt_0NhoND6E41RsKWVP43fW1
```

Evento clave recibido:

```text
subscription.plan_changed
```

## 3. Conclusión funcional

El cambio PRO -> Enterprise funcionó como se esperaba:

```text
No se generó una segunda subscription_id.
La misma suscripción pasó de PRO a Enterprise.
El webhook actualizó org_billing.
La UI mostró Enterprise después del reload.
```

## 4. Problema corregido

El problema pendiente era de experiencia de usuario: si la Edge Function devuelve un error no-2xx pero el webhook ya dejó la organización en Enterprise active, el usuario no debe ver un error rojo final.

## 5. Archivo modificado

```text
src/components/Billing/UpgradeToProButton.tsx
```

## 6. Cambio aplicado

Se agregó una verificación defensiva en el botón de checkout/upgrade:

```text
Si el usuario solicita Enterprise y la Edge Function devuelve error,
el frontend consulta org_billing.
Si org_billing ya está Enterprise active,
redirige a Billing en vez de mostrar error rojo.
```

También se maneja el caso idempotente:

```text
enterprise_already_active
```

como estado exitoso para la experiencia del usuario.

## 7. Resultado esperado

En Preview:

```text
FREE -> PRO TEST -> Enterprise
```

Durante PRO -> Enterprise:

```text
No se abre una segunda suscripción.
No se muestra error rojo si el webhook ya completó Enterprise.
La UI vuelve a Billing.
Billing muestra Enterprise active.
```

## 8. Seguridad

No se tocó Supabase Production.
No se hizo Promote.
No se modificaron secrets.
No se modificó schema.
No se hizo push a main.

## 9. Próxima validación

Repetir, si es necesario, una prueba controlada en Preview:

```text
1. Bajar una org de prueba a FREE solo en Preview.
2. Comprar PRO TEST.
3. Subir a Enterprise.
4. Confirmar que no aparece error rojo final.
5. Confirmar que sigue existiendo una sola subscription_id.
```
