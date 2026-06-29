# Dodo webhook Live/Test environment compatibility

Fecha: 2026-06-28  
Branch operativo: `preview`

## Objetivo

Preparar `supabase/functions/dodo-webhook/index.ts` para funcionar correctamente en dos ambientes:

- Preview/Test: Dodo Test Mode.
- Production/Live: Dodo Live Mode.

## Problema corregido

El webhook todavía estaba amarrado a variables TEST:

- `DODO_PRODUCT_ID_PRO_TEST`
- `DODO_PRODUCT_ID_ENTERPRISE_TEST`
- `DODO_WEBHOOK_SECRET_TEST`

Eso impedía desplegar la función a Production con seguridad, porque los eventos LIVE de Dodo deben validarse con el secret LIVE y resolverse con los product IDs LIVE.

## Regla implementada

La función ahora lee `DODO_ENV`.

### Si `DODO_ENV=live`

Usa:

- `DODO_WEBHOOK_SECRET_LIVE`
- `DODO_PRODUCT_ID_PRO_LIVE`
- `DODO_PRODUCT_ID_ENTERPRISE_LIVE`

### Si `DODO_ENV` falta o no es `live`

Usa modo test por defecto:

- `DODO_WEBHOOK_SECRET_TEST`
- `DODO_PRODUCT_ID_PRO_TEST`
- `DODO_PRODUCT_ID_ENTERPRISE_TEST`

## Archivos modificados

- `supabase/functions/dodo-webhook/index.ts`

## Reglas operativas

- No se modifica Production desde este cambio.
- No se hace Promote.
- No se hace push a `main`.
- Primero se valida en `preview`.
- El deploy a Production de esta función solo debe hacerse después de configurar los secrets LIVE en Supabase Production.

## Secrets requeridos en Supabase Production

Antes del deploy Production:

- `DODO_ENV=live`
- `DODO_WEBHOOK_SECRET_LIVE`
- `DODO_PRODUCT_ID_PRO_LIVE`
- `DODO_PRODUCT_ID_ENTERPRISE_LIVE`

La función `dodo-create-checkout` también requiere:

- `DODO_API_KEY_LIVE`
- `DODO_APP_BASE_URL_LIVE`
- opcionalmente `DODO_RETURN_URL_LIVE`
- opcionalmente `DODO_CANCEL_URL_LIVE`
