# Subscriptions architecture — fuente interna de verdad

Fecha: 2026-06-26  
Estado: **diseño conceptual / no implementación**

## Objetivo

Definir cómo debe entender GeoField GPS las suscripciones SaaS de forma independiente del proveedor de pagos.

Dodo, Paddle, Stripe u otro proveedor pueden cobrar o emitir eventos, pero la app debe consultar el estado comercial desde su propia base interna.

## Principio central

```txt
Proveedor externo cobra
Base interna decide acceso
Frontend solo consulta estado interno
```

Ninguna pantalla pública debe activar un plan.

## Unidad comercial

La unidad comercial principal es la organización.

Una organización puede tener:

- un plan interno;
- un estado de suscripción;
- límites y entitlements;
- usuarios administradores;
- trackers;
- geocercas;
- reportes;
- historial operativo.

## Planes internos

Planes conceptuales actuales:

- `free`
- `pro`
- `enterprise`

Productos externos Dodo TEST:

| Plan interno | Product ID TEST |
|---|---|
| `pro` | `pdt_0NhoMPN43aL0XnHSZhrTk` |
| `enterprise` | `pdt_0NhoND6E41RsKWVP43fW1` |

Los IDs LIVE serán diferentes y no deben mezclarse con TEST.

## Entitlements

Cada plan debe traducirse en capacidades verificables:

- cantidad máxima de trackers;
- cantidad máxima de geocercas;
- acceso a benchmarking;
- reportes avanzados;
- capacidad operativa adicional;
- soporte comercial;
- retención de datos;
- futuras integraciones.

Los límites deben aplicarse desde backend/base de datos, no solo desde frontend.

## Estados internos sugeridos

- `free`
- `trialing`
- `active`
- `past_due`
- `canceled`
- `expired`
- `paused`
- `manual_review`

La implementación debe adaptarse a la estructura real existente.

## Separación proveedor / suscripción interna

La suscripción interna debe poder guardar referencias externas sin depender totalmente del proveedor:

- proveedor actual;
- ambiente;
- customer externo;
- subscription externa;
- product/price externo;
- último evento externo procesado;
- estado interno;
- plan interno;
- organización interna.

## Cambio futuro de proveedor

Si en el futuro se cambia de Dodo a otro proveedor, la app debe conservar:

- organizaciones;
- usuarios;
- trackers;
- geocercas;
- historial operativo;
- plan interno;
- entitlements.

Solo debería cambiar la integración externa de cobro/eventos.

## Activación manual vs automática

Durante la fase actual:

- no hay activación automática;
- `/billing/return` es informativa;
- el plan real sigue en la base interna.

Fase futura:

- webhooks TEST podrán activar plan interno en Preview;
- luego se evaluará LIVE solo con orden expresa.

## Reglas de seguridad

- No activar planes desde frontend.
- No confiar en query params para plan o pago.
- No exponer secretos.
- No mezclar TEST y LIVE.
- No tocar Android para billing web.
- No cambiar Production sin orden expresa.
- No modificar SQL sin auditoría previa.

## Bloqueo actual

La implementación está bloqueada hasta recuperar acceso al proyecto Supabase real:

```txt
mujwsfhkocsuuahlrssn
```

Sin ese acceso no se debe crear ni modificar estructura de suscripciones.
