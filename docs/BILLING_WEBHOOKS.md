# Billing webhooks — diseño proveedor-agnóstico

Fecha: 2026-06-26  
Estado: **diseño / no implementación**

## Objetivo

Definir cómo deberían procesarse en el futuro los eventos de billing recibidos desde proveedores externos como Dodo, Paddle u otros Merchant of Record.

Este documento no contiene SQL ejecutable ni instrucciones de despliegue. La implementación está bloqueada hasta recuperar acceso al proyecto Supabase correcto y auditar la base actual.

## Responsabilidad del webhook de billing

Un webhook de billing debe transformar eventos externos en estado interno confiable.

Ejemplo:

```txt
payment succeeded / subscription active
  ↓
validación server-side
  ↓
plan interno activo para una organización
```

## Qué no debe hacer

Un webhook de billing no debe depender de:

- parámetros del navegador;
- rutas `/billing/return` o `/billing/success`;
- datos editables por el usuario;
- estado visual del frontend;
- IDs de plan enviados sin validar.

## Entidades conceptuales

La implementación futura debe revisar si ya existen tablas equivalentes antes de crear algo nuevo.

Entidades conceptuales:

- organización cliente;
- plan interno;
- suscripción interna;
- cliente externo;
- suscripción externa;
- producto/precio externo;
- evento externo;
- estado de procesamiento del evento.

## Mapeo de planes

Los productos Dodo TEST actuales son:

| Producto Dodo TEST | Plan interno esperado |
|---|---|
| `pdt_0NhoMPN43aL0XnHSZhrTk` | `pro` |
| `pdt_0NhoND6E41RsKWVP43fW1` | `enterprise` |

Este mapeo debe vivir en backend/base de datos, no en la URL de retorno ni en el navegador.

## Estados de procesamiento de evento

Estados conceptuales sugeridos:

- `received`
- `validated`
- `ignored`
- `processed`
- `failed`
- `duplicate`
- `manual_review`

## Estados de suscripción interna

Estados conceptuales sugeridos:

- `free`
- `trialing`
- `active`
- `past_due`
- `canceled`
- `expired`
- `paused`
- `manual_review`

Los nombres definitivos deben adaptarse a la estructura real de la base.

## Casos que debe cubrir la implementación futura

### Alta de suscripción

Cuando el proveedor confirme una suscripción activa:

- validar evento;
- resolver organización;
- resolver plan;
- guardar IDs externos;
- activar plan interno;
- registrar fecha de inicio y próxima renovación, si el payload la incluye.

### Renovación

Cuando haya renovación exitosa:

- actualizar `last_paid_at` o equivalente;
- actualizar próxima fecha de cobro si aplica;
- mantener estado activo.

### Pago fallido

Cuando haya pago fallido:

- no cancelar inmediatamente si el proveedor maneja reintentos;
- marcar estado conceptual `past_due` o equivalente;
- conservar acceso según política comercial futura.

### Cancelación

Cuando el proveedor confirme cancelación:

- distinguir cancelación inmediata vs al final del período;
- actualizar estado interno;
- preservar auditoría.

### Reembolso/disputa

Si aplica:

- marcar evento para revisión;
- no borrar datos operativos;
- ajustar estado comercial según política.

## Auditoría previa obligatoria

Antes de implementar, auditar read-only:

- `org_billing` o tabla equivalente;
- organizaciones;
- perfiles/usuarios;
- memberships;
- funciones/RPC de plan o billing;
- RLS policies;
- vistas y triggers relacionados.

No modificar tablas sin ese mapa.

## Estado actual

Checkout TEST y retorno neutral ya están validados en Preview.

Pendiente:

- recuperar acceso a Supabase `mujwsfhkocsuuahlrssn`;
- ejecutar auditoría read-only;
- confirmar estructura real;
- diseñar migración mínima;
- implementar webhook TEST.
