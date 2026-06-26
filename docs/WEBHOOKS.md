# Webhooks — reglas generales del sistema

Fecha: 2026-06-26  
Estado: **guía general / no implementación**

## Objetivo

Definir reglas universales para cualquier webhook externo que GeoField GPS reciba en el futuro.

Los webhooks son integraciones server-side. Nunca deben procesarse desde frontend ni depender de una ruta pública de navegador como prueba de un evento real.

## Principios obligatorios

1. **Validación de origen**: verificar firma, secreto o mecanismo oficial del proveedor.
2. **Idempotencia**: procesar cada evento externo una sola vez.
3. **Separación de ambientes**: TEST y LIVE no se mezclan.
4. **Proveedor-agnóstico**: el modelo interno no debe depender completamente del nombre de un proveedor.
5. **Auditoría**: registrar eventos recibidos, procesados, fallidos y descartados.
6. **Fallar cerrado**: si la firma o payload no son válidos, no modificar datos internos.
7. **Sin secretos en frontend**: ningún webhook secret, API key o service role puede estar en React/Vite.

## Flujo conceptual

```txt
Proveedor externo
  ↓
Endpoint server-side
  ↓
Validación de firma
  ↓
Validación de ambiente
  ↓
Registro idempotente
  ↓
Procesamiento interno
  ↓
Actualización de tablas internas
  ↓
Respuesta al proveedor
```

## Separación de ambientes

Todo evento debe identificar o inferir ambiente:

- `test`
- `live`

Reglas:

- un evento TEST nunca modifica datos LIVE;
- un evento LIVE nunca se procesa con secretos TEST;
- IDs de producto TEST y LIVE deben mantenerse separados;
- variables de entorno de Preview y Production no deben mezclarse.

## Idempotencia

Cada proveedor suele enviar un identificador único de evento. Ese identificador debe persistirse junto con:

- proveedor;
- ambiente;
- tipo de evento;
- fecha de recepción;
- estado de procesamiento.

Si el mismo evento llega dos veces, la segunda recepción no debe duplicar efectos.

## Seguridad

No guardar ni exponer:

- datos completos de tarjetas;
- contraseñas;
- API keys;
- webhook secrets;
- recovery codes;
- códigos 2FA;
- service role keys.

Los logs deben ser útiles para soporte, pero no deben contener secretos.

## Rutas públicas vs webhooks

Rutas públicas como `/billing/return`, `/billing/success` y `/billing/cancel` son solo pantallas de navegación.

No deben:

- activar planes;
- confirmar pagos;
- modificar suscripciones;
- escribir en la base de datos;
- llamar funciones privilegiadas.

La confirmación real debe llegar por webhook validado server-side.

## Estado actual

La arquitectura de webhooks Dodo TEST está diseñada en:

- `DODO_WEBHOOKS_TEST_ARCHITECTURE.md`
- `BILLING_WEBHOOKS.md`
- `SUBSCRIPTIONS_ARCHITECTURE.md`

No se implementa todavía porque falta recuperar acceso al proyecto Supabase real:

```txt
mujwsfhkocsuuahlrssn
```
