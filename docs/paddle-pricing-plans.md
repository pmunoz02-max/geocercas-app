# Paddle Pricing Plans (Preview)

## Context

Se implementa soporte para múltiples planes en Paddle utilizando un solo producto con múltiples precios.

## Producto

Geocercas SaaS

## Precios

- PRO
  - price_id: PADDLE_PRO_PRICE_ID
  - amount: 29 USD mensual

- ENTERPRISE
  - price_id: PADDLE_ENTERPRISE_PRICE_ID
  - amount: 99 USD mensual

## Flujo

Frontend:
- envía plan_code ('pro' | 'enterprise') a paddle-create-checkout

Edge Function:
- map plan_code → price_id
- genera checkout Paddle

Webhook:
- recibe evento de Paddle
- identifica price_id
- mapea a plan
- actualiza org_billing
- sincroniza org_entitlements.max_trackers

## Reglas

- NO usar múltiples productos en Paddle
- NO exponer price_id en frontend
- SIEMPRE usar plan_code como abstracción
- Supabase es la fuente de verdad de entitlements