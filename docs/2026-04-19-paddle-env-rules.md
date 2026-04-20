# Paddle Environment Rules

Todas las integraciones Paddle usan una sola fuente de verdad para el entorno:

- **preview.tugeocercas.com** → sandbox
- **app.tugeocercas.com** → live
- Edge Functions usan la variable de entorno `PADDLE_ENV` ("sandbox" o "live")

## Variables de entorno requeridas

### Sandbox (preview)
- PADDLE_API_KEY_SANDBOX
- PADDLE_PRO_PRICE_ID_SANDBOX
- PADDLE_ENTERPRISE_PRICE_ID_SANDBOX
- VITE_PADDLE_CLIENT_TOKEN_SANDBOX

### Live (producción)
- PADDLE_API_KEY_LIVE
- PADDLE_PRO_PRICE_ID_LIVE
- PADDLE_ENTERPRISE_PRICE_ID_LIVE
- VITE_PADDLE_CLIENT_TOKEN_LIVE

## Uso en código

- Usa la función central `getPaddleEnv()` para decidir entorno.
- Usa helpers para obtener API key, price_id y token según entorno.
- Nunca mezcles credenciales sandbox/live.

## Ejemplo

```ts
import { getPaddleEnv, getPaddleApiKey, getPaddlePriceId, getPaddleClientToken } from "@/config/paddleEnv";

const env = getPaddleEnv();
const apiKey = getPaddleApiKey();
const priceId = getPaddlePriceId("pro");
const clientToken = getPaddleClientToken();
```

- En frontend, el entorno se decide por hostname.
- En backend/Edge, por variable de entorno `PADDLE_ENV`.

## Referencias
- src/config/paddleEnv.ts
- supabase/functions/paddle-create-checkout/paddleEnv.ts
- supabase/functions/paddle-webhook/paddleEnv.ts
