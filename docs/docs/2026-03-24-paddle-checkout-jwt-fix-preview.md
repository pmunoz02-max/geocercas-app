# Paddle checkout JWT fix - preview

Fecha: 2026-03-24
Entorno: preview only

## Cambio
Se ajustó el flujo de Paddle checkout en preview para estabilizar la inicialización de Paddle.js y el backend de creación de checkout.

## Archivos
- src/pages/paddle-checkout.tsx
- supabase/functions/paddle-create-checkout/index.ts

## Motivo
Eliminar errores del flujo Paddle en preview:
- Failed to retrieve JWT
- errores intermitentes de apertura de checkout

## Alcance
- Solo preview
- No producción

## Notas
- Backend crea transaction y devuelve checkout URL
- Frontend consume `_ptxn`
- Siguiente fase: webhook `transaction.completed` + activación PRO en DB