# Dodo Edge Functions LIVE/TEST Environment Compatibility

Fecha: 2026-06-28

## Alcance

Este paso actualiza `supabase/functions/dodo-create-checkout/index.ts` para que no use nombres TEST hardcodeados cuando se despliegue a Production.

## Regla operativa

La función lee `DODO_ENV`:

- `DODO_ENV=test` o ausente: usa variables TEST y `https://test.dodopayments.com`.
- `DODO_ENV=live`: usa variables LIVE y `https://live.dodopayments.com`.

## Variables esperadas

### Preview / TEST

- `DODO_ENV=test`
- `DODO_API_KEY_TEST`
- `DODO_PRODUCT_ID_PRO_TEST`
- `DODO_PRODUCT_ID_ENTERPRISE_TEST`
- `DODO_APP_BASE_URL_TEST` o `DODO_APP_BASE_URL`
- `DODO_RETURN_URL_TEST` opcional
- `DODO_CANCEL_URL_TEST` opcional

### Production / LIVE

- `DODO_ENV=live`
- `DODO_API_KEY_LIVE`
- `DODO_PRODUCT_ID_PRO_LIVE`
- `DODO_PRODUCT_ID_ENTERPRISE_LIVE`
- `DODO_APP_BASE_URL_LIVE` recomendado
- `DODO_RETURN_URL_LIVE` opcional
- `DODO_CANCEL_URL_LIVE` opcional

## Importante

No se debe desplegar `dodo-webhook` a Production hasta aplicar el mismo patrón LIVE/TEST en ese archivo. El archivo `dodo-webhook/index.ts` no quedó incluido en este paquete porque el upload recibido contenía solamente `dodo-create-checkout/index.ts`.

## Estado

- Base de datos Production: estructura Dodo ya aplicada.
- Edge Function `dodo-create-checkout`: preparada para LIVE/TEST.
- Edge Function `dodo-webhook`: pendiente de corregir con archivo separado.
- Production: no desplegar funciones hasta completar ambos archivos.
