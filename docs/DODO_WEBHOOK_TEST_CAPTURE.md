# Dodo webhook TEST capture — Preview only

Fecha: 2026-06-27  
Estado: **captura temporal / sin escrituras DB**  
Ambiente: **Preview**  
Supabase Preview: `mujwsfhkocsuuahlrssn`

## Objetivo

Crear un endpoint temporal de Edge Function para recibir eventos Dodo TEST y conocer de forma segura:

- nombres reales de eventos;
- headers de firma disponibles;
- estructura del payload;
- campos donde aparecen `product_id`, `customer_id`, `subscription_id`, `payment_id` y metadata/custom data.

Esta fase no activa planes, no modifica `org_billing`, no crea tablas, no guarda payloads y no toca Producción.

## Function

```txt
supabase/functions/dodo-webhook-test-capture
```

URL esperada en Preview:

```txt
https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/dodo-webhook-test-capture
```

## Reglas de seguridad

- `verify_jwt = false`, porque Dodo debe poder llamar el webhook sin sesión de usuario.
- No usa `service_role`.
- No usa secretos.
- No escribe en base de datos.
- No registra tarjetas, credenciales ni secretos.
- Registra solo resumen sanitizado del payload y presencia de headers relevantes.
- Es temporal; debe eliminarse o reemplazarse por `dodo-webhook` real cuando se confirme firma/payload.

## Uso operativo

1. Desplegar únicamente en Supabase Preview.
2. Configurar en Dodo Test Mode la URL temporal.
3. Ejecutar una compra TEST PRO y una Enterprise.
4. Revisar logs de la función.
5. Con esos datos diseñar la migración mínima y el webhook definitivo.

## Prohibido

- No configurar este endpoint en Dodo LIVE.
- No usarlo en Producción.
- No activar planes desde este endpoint.
- No asumir que una ruta de retorno del navegador confirma pago.
