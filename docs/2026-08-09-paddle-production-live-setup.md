# Puesta en producción de Paddle Live — 9 Ago 2026

## Resumen
Se documenta la puesta en producción de Paddle Live para el flujo de billing del producto, incluyendo la configuración de precios, trial, credenciales Live, webhook de Production, cliente token Live y la selección del provider según el build promocionado.

## Configuración de producto y precios
- PRO: 29 USD/mes.
- Enterprise: 99 USD/mes.
- Trial: 10 días.

## Credenciales y configuración Live
- API key Live configurada para Paddle.
- Price IDs Live configurados para los planes PRO y Enterprise.
- Webhook de Production configurado y pendiente de validación end-to-end con un evento Live real.
- Client token Live disponible para su uso tanto en Preview como en Production.

## Selección de checkout y entorno
- El proveedor de checkout se selecciona con `VITE_BILLING_PROVIDER`.
- El entorno Paddle se determina con `getPaddleEnv` según el hostname:
  - Preview usa sandbox.
  - Producción usa live.
- El mismo código y commit puede operar correctamente en Preview y Producción, mientras cada entorno disponga de sus variables Vercel correspondientes.

## Promoción a Producción
- Promote to Production reconstruye el proyecto utilizando las variables de entorno de Production configuradas en Vercel.
- Las variables `VITE_*` necesarias para Paddle Live deben existir también en Production; no basta con que estén definidas únicamente en Preview.
- Se verificó en Producción la apertura correcta de:
  - GeoField GPS PRO — 29 USD/mes.
  - GeoField GPS Enterprise — 99 USD/mes.
- Ambos checkouts Live mostraron correctamente el trial de 10 días.
- La validación de Enterprise se realizó abriendo el checkout Live sin completar un cobro real.
