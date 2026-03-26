
# Problemas Conocidos

Este documento registra errores recurrentes y sus soluciones.

## Billing Preview (Paddle)

- 401 Unauthorized: verificar verify_jwt = false en paddle-webhook
- 502 Bad Gateway: handler inválido en Edge Function
- Firma inválida: secret incorrecto (endpoint_secret_key)
- Falta org_id en custom_data: simulaciones Paddle pueden omitirlo
- UI muestra Stripe legacy: revisar labels y endpoints
- Endpoint incorrecto: debe ser supabase.co/functions/v1

## Problema: tracker_positions no filtra correctamente

**Causa:**
- user_id no sincronizado con personal

**Solución:**
- asegurar:
  - personal.user_id = auth.users.id

## Problema: dashboard muestra datos de otra organización

**Causa:**
- query sin org_id

**Solución:**
- filtrar siempre por org_id