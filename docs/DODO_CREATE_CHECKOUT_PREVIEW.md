# Dodo TEST checkout creation — Preview only

## Estado

Esta documentación cubre la función temporal/preview `dodo-create-checkout`.

- Ambiente: **Preview only**.
- Supabase Preview: `mujwsfhkocsuuahlrssn`.
- Supabase Producción: `wpaixkvokdkudymgjoua`.
- Producción no se toca.
- No activa planes todavía.
- No modifica `org_billing`.
- No reemplaza `stripe-webhook` ni `paddle-webhook`.

## Objetivo

Crear checkout sessions en Dodo TEST desde nuestro backend para poder inyectar metadata interna y luego asociar webhooks con la organización correcta.

El problema detectado con links estáticos de Dodo fue que los webhooks llegaron sin metadata interna:

- `metadata_keys: []`
- `customer_id: null`

Por eso el webhook podía identificar el producto comprado, pero no podía asignar con seguridad la compra a una organización interna.

## Función nueva

Ruta local:

```txt
supabase/functions/dodo-create-checkout
```

Endpoint Preview:

```txt
https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/dodo-create-checkout
```

## Seguridad

La función usa `verify_jwt = false` en `config.toml` para controlar CORS y validar JWT manualmente dentro del código.

Para `POST`, la función exige:

1. `Authorization: Bearer <supabase_user_jwt>`.
2. `org_id` válido en el body.
3. Que el usuario sea `admin` u `owner` de esa organización mediante `requireOrgAdmin(req, orgId)`.

Sin autorización válida, devuelve 401/403.

## Body esperado

```json
{
  "org_id": "<uuid-org>",
  "plan": "pro"
}
```

Planes permitidos:

```txt
pro
enterprise
```

## Secrets requeridos en Supabase Preview

```txt
DODO_API_KEY_TEST
DODO_PRODUCT_ID_PRO_TEST
DODO_PRODUCT_ID_ENTERPRISE_TEST
```

Opcionales:

```txt
DODO_API_BASE_URL
DODO_APP_BASE_URL
DODO_RETURN_URL_TEST
DODO_CANCEL_URL_TEST
```

Defaults:

```txt
DODO_API_BASE_URL=https://test.dodopayments.com
DODO_APP_BASE_URL=https://preview.tugeocercas.com
DODO_RETURN_URL_TEST=https://preview.tugeocercas.com/billing/return?lang=es
DODO_CANCEL_URL_TEST=https://preview.tugeocercas.com/billing/cancel?lang=es
```

## Product IDs TEST confirmados

```txt
PRO        → pdt_0NhoMPN43aL0XnHSZhrTk
Enterprise → pdt_0NhoND6E41RsKWVP43fW1
```

## Payload enviado a Dodo

La función envía a Dodo TEST:

```json
{
  "product_cart": [
    {
      "product_id": "pdt_...",
      "quantity": 1
    }
  ],
  "return_url": "https://preview.tugeocercas.com/billing/return?lang=es",
  "cancel_url": "https://preview.tugeocercas.com/billing/cancel?lang=es",
  "metadata": {
    "org_id": "<uuid-org>",
    "plan_code": "pro",
    "source": "geofield-preview",
    "environment": "preview",
    "requested_by": "<supabase-user-id>"
  }
}
```

No incluir datos sensibles en metadata.

## Respuesta esperada

```json
{
  "ok": true,
  "checkout_url": "https://...",
  "session_id": "...",
  "provider": "dodo",
  "mode": "test",
  "plan": "pro"
}
```

La UI debe redirigir al usuario a `checkout_url`.

## Deploy Preview

```powershell
supabase functions deploy dodo-create-checkout --project-ref mujwsfhkocsuuahlrssn
```

No usar:

```txt
wpaixkvokdkudymgjoua
```

Ese es Producción.

## Pruebas mínimas

### Sin Authorization

Debe devolver 401:

```powershell
curl.exe -i -X POST "https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/dodo-create-checkout" `
  -H "Content-Type: application/json" `
  --data-binary "{\"org_id\":\"00000000-0000-0000-0000-000000000000\",\"plan\":\"pro\"}"
```

### Desde la app

La prueba real debe hacerse desde sesión autenticada en Preview, usando el JWT del usuario y el `org_id` actual.

## Próximo paso

Después de validar que Dodo webhooks llegan con metadata, diseñar/implementar `dodo-webhook` definitivo:

1. Verificación de firma `webhook-signature` usando raw body.
2. Idempotencia por evento.
3. Mapeo `product_id → plan_code`.
4. Validación cruzada con `metadata.org_id` y `metadata.plan_code`.
5. Actualización segura de `org_billing`.
6. Auditoría mínima sin payload crudo.
