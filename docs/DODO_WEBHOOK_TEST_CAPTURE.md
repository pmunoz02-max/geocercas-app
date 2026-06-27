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
- Guarda solo resumen sanitizado en `public.audit_log`.

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

- headers presentes, sin valores de firma;
- llaves top-level;
- llaves de `data`;
- previews truncados de valores primitivos;
- posibles IDs: event, product, price, customer, subscription, payment;
- tamaño del body;
- parse error si hubiera.

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

## Probar POST manual

```powershell
curl.exe -i -X POST "https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/dodo-webhook-test-capture" `
  -H "Content-Type: application/json" `
  --data '{ "test": "manual", "source": "local" }'
```

Resultado esperado:

```json
{
  "ok": true,
  "captured": true,
  "stored": true,
  "mode": "preview-test-only"
}
```

## Leer capturas

```powershell
$readKey = Get-Content .\tmp-dodo-capture-read-key.txt
curl.exe -s "https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/dodo-webhook-test-capture?limit=10" `
  -H "x-capture-read-key: $readKey"
```

## Flujo Dodo Test Mode

1. Configurar el endpoint temporal en Dodo Test Mode.
2. Ejecutar compra TEST para PRO.
3. Ejecutar compra TEST para Enterprise.
4. Leer capturas con el comando GET.
5. Diseñar `dodo-webhook` definitivo con firma, idempotencia y mapeo a `org_billing`.

## Prohibiciones

No usar este endpoint en Live Mode.
No deployar esta función a Producción.
No usar `wpaixkvokdkudymgjoua`.
No activar planes desde esta función temporal.
No guardar payload crudo completo.
