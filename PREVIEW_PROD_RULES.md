# Regla de separación de ambientes: Preview vs Producción

**Nunca mezcles configuraciones, claves o endpoints entre preview y producción.**

- Preview (deploys de preview, entornos vercel.app, etc):
  - Solo usa claves, endpoints y cuentas SANDBOX/TEST (ejemplo: Paddle sandbox, bases de datos de prueba, etc).
  - Nunca uses claves o datos de producción.

- Producción (app.tugeocercas.com y dominios live):
  - Solo usa claves, endpoints y cuentas LIVE/PRODUCCIÓN (ejemplo: Paddle live, bases de datos reales, etc).
  - Nunca uses claves, endpoints ni datos de preview/sandbox/test.

**Motivo:**
- Evitar errores de facturación, fugas de datos o problemas legales.
- Garantizar que pruebas y cambios no afecten usuarios reales ni cobros reales.

**Ejemplo de detección de entorno:**

```js
const isPreviewEnv =
  typeof window !== "undefined" &&
  (window.location.hostname.includes("preview") ||
    window.location.hostname.includes("vercel.app"));
```

**Cumple siempre esta separación en:**
- Claves API
- Endpoints de pago (Paddle, Stripe, etc)
- Bases de datos
- Cuentas de correo
- Cualquier integración externa

---

Actualiza esta nota si cambian los dominios o reglas de despliegue.