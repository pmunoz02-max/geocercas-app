# Paddle Production Fix (Checkout Error 500)

## Problema
En producción (`app.tugeocercas.com`), el flujo de checkout fallaba con error:

- 500 status
- "Invalid Paddle API key"
- "Must start with pdl_ and match environment (sandbox vs live)"

## Causa
La Edge Function `paddle-create-checkout` estaba ejecutándose en entorno `live`, pero la API key configurada no correspondía a Paddle Live o no tenía el prefijo `pdl_`.

## Solución aplicada
1. Se añadió validación en la Edge Function:
   - Verifica que la key en entorno `live` empiece con `pdl_`
   - Log controlado del prefijo (sin exponer la key completa)

2. Se añadió logging:
   - `env`
   - prefijo de API key

3. Se corrigieron los secrets en producción:
   - `PADDLE_ENV=live`
   - `PADDLE_API_KEY_LIVE` válida
   - `PADDLE_PRO_PRICE_ID_LIVE`

## Impacto
- Checkout Paddle funcional en producción
- Eliminación de error 500 en flujo de suscripción
- Mejora en diagnóstico futuro

## Nota
Preview sigue usando sandbox/test. Producción usa exclusivamente live.