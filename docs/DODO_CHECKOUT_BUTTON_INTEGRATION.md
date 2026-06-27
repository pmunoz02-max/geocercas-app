# Dodo checkout button integration — Preview only

## Estado

Este documento cubre la integración UI del botón de upgrade con la función Preview `dodo-create-checkout`.

- Branch operativo: `preview`.
- Supabase Preview: `mujwsfhkocsuuahlrssn`.
- Supabase Producción: `wpaixkvokdkudymgjoua`.
- Producción no se toca.
- No activa planes todavía.
- No modifica `org_billing`.
- No reemplaza `stripe-webhook` ni `paddle-webhook`.

## Objetivo

El botón de upgrade ya no debe abrir directamente links estáticos de Dodo para usuarios autenticados. En su lugar debe:

1. Tomar la sesión real del usuario.
2. Tomar el `org_id` actual.
3. Llamar la Edge Function `dodo-create-checkout`.
4. Recibir `checkout_url`.
5. Redirigir al checkout externo de Dodo TEST.

Esto permite que el checkout se cree con metadata interna segura:

```json
{
  "org_id": "<uuid-org>",
  "plan_code": "pro",
  "source": "geofield-preview",
  "environment": "preview"
}
```

## Archivo integrado

```txt
src/components/Billing/UpgradeToProButton.tsx
```

## Comportamiento

### Usuario autenticado con organización actual

El botón llama:

```txt
https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/dodo-create-checkout
```

mediante:

```txt
supabase.functions.invoke("dodo-create-checkout", ...)
```

con body:

```json
{
  "org_id": "<currentOrgId>",
  "plan": "pro"
}
```

La función devuelve:

```json
{
  "ok": true,
  "checkout_url": "https://...",
  "provider": "dodo",
  "mode": "test"
}
```

La UI redirige a `checkout_url`.

### Usuario público o sin organización actual

El botón no abre un checkout sin organización interna. Si no hay sesión, redirige a `/login?next=/billing`.

Esto evita que Dodo genere webhooks sin `org_id` en metadata.

## Seguridad

El botón no maneja claves Dodo. La clave Dodo TEST vive solo como secret de Supabase Preview:

```txt
DODO_API_KEY_TEST
```

El botón envía un JWT de usuario a la Edge Function. La autorización real se valida server-side con `requireOrgAdmin(req, orgId)`.

## Limitaciones de esta fase

El botón solo crea checkout. Todavía no activa planes.

La activación futura dependerá de `dodo-webhook`, que debe:

1. Verificar firma.
2. Aplicar idempotencia.
3. Validar `metadata.org_id`.
4. Validar `metadata.plan_code`.
5. Mapear `product_id → plan_code`.
6. Actualizar `org_billing` de forma segura.

## Prueba esperada

1. Iniciar sesión en Preview.
2. Seleccionar o confirmar organización actual.
3. Ir a `/pricing` o `/billing`.
4. Hacer clic en PRO o Enterprise.
5. La app debe abrir un checkout Dodo TEST creado dinámicamente.
6. Luego, el webhook temporal `dodo-webhook-test-capture` debe mostrar metadata con `org_id` y `plan_code`.

## Prohibiciones

No hacer:

```powershell
supabase functions deploy dodo-create-checkout --project-ref wpaixkvokdkudymgjoua
```

No hacer Promote a Production.

No activar Live Mode.

No usar links estáticos de Dodo para activar planes internos.
