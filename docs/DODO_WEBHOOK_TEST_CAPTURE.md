# Dodo TEST webhook capture — Preview only

## Estado

Función temporal de captura para Dodo Payments en Test Mode.

Proyecto Supabase permitido:

```text
Preview: mujwsfhkocsuuahlrssn
```

Proyecto prohibido para esta función:

```text
Production: wpaixkvokdkudymgjoua
```

## Endpoint

```text
https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/dodo-webhook-test-capture
```

## Objetivo

Capturar la estructura real de eventos Dodo TEST antes de implementar el webhook definitivo.

Esta función temporal:

- No activa planes.
- No modifica `org_billing`.
- No toca Stripe.
- No toca Paddle.
- No toca Producción.
- No guarda payload crudo completo.
- No guarda previews de `billing`, `customer`, tarjeta, links de pago ni links de factura.
- Guarda solo resumen mínimo sanitizado en `public.audit_log`.

## Tabla usada

No se crea ninguna tabla nueva.

Se reutiliza:

```text
public.audit_log
```

Acción registrada:

```text
dodo.webhook.test_capture
```

El campo `details` contiene un resumen sanitizado:

- nombres de headers presentes, sin valores de firma;
- llaves top-level no sensibles;
- llaves de `data` no sensibles;
- IDs útiles cuando existen: event, business, brand, product, price, customer, subscription, payment, invoice, checkout session;
- status, currency, total amount y fechas operativas cuando existen;
- tamaño del body;
- parse error si hubiera;
- conteo de llaves sensibles detectadas, sin nombres ni valores.

## Lo que aprendimos de Dodo TEST

Las compras TEST de PRO y Enterprise confirmaron que Dodo envía eventos con esta forma general:

```json
{
  "business_id": "...",
  "data": { "...": "..." },
  "timestamp": "...",
  "type": "..."
}
```

Eventos reales capturados:

```text
payment.succeeded
subscription.renewed
subscription.active
subscription.updated
```

Headers reales observados:

```text
user-agent: Svix-Webhooks/rolling
content-type: application/json
webhook-signature: presente
```

Mapeo Dodo TEST observado:

```text
pdt_0NhoMPN43aL0XnHSZhrTk → pro
pdt_0NhoND6E41RsKWVP43fW1 → enterprise
```

Los eventos de suscripción incluyen `data.product_id` y `data.subscription_id`, por lo que son mejores candidatos para activar o actualizar plan que `payment.succeeded`.

`payment.succeeded` sirve como auditoría de pago y trae `payment_id`, `invoice_id`, `checkout_session_id`, `subscription_id`, monto y moneda.


## Endurecimiento aplicado

La función temporal no debe mostrar valores ni nombres de campos sensibles. Por eso, tanto las nuevas capturas como la lectura de capturas previas filtran:

```text
card_*
billing
invoice_url
payment_link
email/address/name/phone
```

En su lugar se mantiene solo `sensitive_key_count` para saber si el payload contenía campos sensibles, sin exponerlos.

## Configuración requerida

La función debe estar deployada sin verificación JWT porque Dodo no envía JWT de Supabase:

```powershell
supabase functions deploy dodo-webhook-test-capture --project-ref mujwsfhkocsuuahlrssn --no-verify-jwt
```

Para leer capturas vía GET se requiere el secret:

```text
DODO_CAPTURE_READ_KEY
```

Ese secret debe existir solo en Supabase Preview.

## Crear secret de lectura en Preview

En PowerShell:

```powershell
$readKey = [guid]::NewGuid().ToString("N")
$readKey | Set-Content .\tmp-dodo-capture-read-key.txt
supabase secrets set DODO_CAPTURE_READ_KEY=$readKey --project-ref mujwsfhkocsuuahlrssn
```

No commitear `tmp-dodo-capture-read-key.txt`.

## Probar POST manual desde archivo

```powershell
@'
{
  "test": "manual",
  "source": "local",
  "ok": true
}
'@ | Set-Content -Path .\tmp-dodo-test-payload.json -Encoding UTF8

curl.exe -i -X POST "https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/dodo-webhook-test-capture" `
  -H "Content-Type: application/json" `
  --data-binary "@.\tmp-dodo-test-payload.json"
```

Resultado esperado:

```json
{
  "ok": true,
  "captured": true,
  "stored": true,
  "mode": "preview-test-only",
  "db_writes": "audit_log_minimal_summary_only"
}
```

## Leer capturas

```powershell
$readKey = Get-Content .\tmp-dodo-capture-read-key.txt
curl.exe -s "https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/dodo-webhook-test-capture?limit=20" `
  -H "x-capture-read-key: $readKey"
```

La respuesta de lectura filtra previews antiguos y también filtra nombres de llaves sensibles (`card_*`, `billing`, `invoice_url`, `payment_link`, emails, dirección, etc.) para no exponer valores ni nombres sensibles que hayan quedado en capturas previas.

## Próximo diseño: `dodo-webhook`

El webhook definitivo debe ser una función nueva separada:

```text
dodo-webhook
```

Requisitos mínimos:

1. Verificación de firma `webhook-signature`.
2. Idempotencia por evento. Si Dodo no entrega `event_id`, usar hash estable de `type + timestamp + business_id + subscription_id/payment_id`.
3. Mapeo `product_id → plan_code`.
4. Actualización segura de `org_billing` solo para eventos de suscripción relevantes.
5. Registro de eventos Dodo en tabla propia o log idempotente.
6. No tocar Stripe/Paddle legacy.
7. No desplegar a Producción hasta orden explícita.

## Prohibiciones

No usar este endpoint en Live Mode.
No deployar esta función a Producción.
No usar `wpaixkvokdkudymgjoua`.
No activar planes desde esta función temporal.
No guardar payload crudo completo.
No guardar valores de tarjeta, links de pago, links de factura, email o dirección de cliente.
