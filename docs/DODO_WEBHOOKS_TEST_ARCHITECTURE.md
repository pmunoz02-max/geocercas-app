# Dodo webhooks TEST — arquitectura futura

Fecha: 2026-06-26  
Estado: **DISEÑADA / NO IMPLEMENTADA**  
Ambiente objetivo: **Preview**  
Proveedor externo actual: **Dodo Payments Test Mode**

## 1. Objetivo

Definir la arquitectura futura para recibir eventos de Dodo Payments en ambiente TEST y sincronizar el estado comercial de una organización dentro de GeoField GPS.

Esta fase **no implementa** SQL, Edge Functions, secretos, webhooks reales ni cambios en producción. El objetivo es dejar una guía operativa clara para cuando se recupere acceso al proyecto Supabase correcto.

## 2. Bloqueo actual

La app Preview usa el proyecto Supabase:

```txt
https://mujwsfhkocsuuahlrssn.supabase.co
```

Project ref:

```txt
mujwsfhkocsuuahlrssn
```

Actualmente no hay acceso al dashboard de ese proyecto. El dashboard visible corresponde a una organización vacía/Free, por lo que **no se debe ejecutar SQL ni crear Edge Functions** hasta recuperar acceso al proyecto real.

Acciones permitidas mientras dure el bloqueo:

- documentar arquitectura;
- revisar código frontend y documentación;
- validar checkout TEST y rutas de retorno;
- preparar prompts o checklists;
- responder a Supabase Support.

Acciones prohibidas mientras dure el bloqueo:

- crear un Supabase nuevo para reemplazar el actual;
- cambiar `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` en Vercel;
- ejecutar SQL en una organización vacía o equivocada;
- crear Edge Functions sin auditoría previa;
- usar `service_role` en frontend, repositorio o chat;
- activar checkout LIVE;
- tocar Android;
- promover cambios de billing a Production sin orden expresa.

## 3. Principios de arquitectura

### 3.1 Fuente de verdad interna

Dodo es proveedor externo de checkout, cobro, suscripciones, eventos y payouts. La fuente de verdad para permisos, límites y plan activo debe seguir siendo la base de datos interna de GeoField GPS.

El frontend nunca debe considerar un plan como activo solo porque el navegador llegó a `/billing/return` o `/billing/success`.

### 3.2 Proveedor-agnóstico

La arquitectura debe permitir cambiar de proveedor sin rediseñar todo el sistema.

Por ello, las tablas y funciones internas deben usar conceptos neutrales:

- `billing_provider`
- `external_product_id`
- `external_customer_id`
- `external_subscription_id`
- `external_event_id`
- `plan_code`
- `subscription_status`

No usar nombres de proveedor como único modelo de datos interno.

### 3.3 Verificación server-side

Todo evento de pago debe validarse en backend antes de modificar la suscripción interna.

La ruta pública de retorno del navegador no es prueba de pago. La confirmación futura debe depender de:

1. webhook recibido desde Dodo;
2. validación de firma/secreto según documentación oficial de Dodo;
3. idempotencia por `external_event_id`;
4. mapeo controlado de producto externo a plan interno;
5. actualización transaccional del estado interno.

## 4. Flujo objetivo TEST

```txt
Cliente abre /pricing o /precios en Preview
  ↓
Selecciona PRO o Enterprise
  ↓
Dodo Test Checkout
  ↓
Dodo redirige navegador a /billing/return?lang=es
  ↓
Webhook TEST llega al endpoint server-side futuro
  ↓
Backend valida firma y ambiente TEST
  ↓
Backend registra evento idempotente
  ↓
Backend mapea producto externo a plan interno
  ↓
Backend actualiza suscripción interna de la organización
  ↓
Frontend lee estado real desde la base interna
```

## 5. Rutas actuales ya validadas

Rutas públicas neutrales implementadas en Preview:

- `/billing/return`
- `/billing/success`
- `/billing/cancel`

Regla vigente:

- No confirman pago.
- No activan plan.
- No escriben en base de datos.
- No llaman webhooks.
- No requieren sesión.
- No contienen lógica específica de Dodo.

Dodo Test Mode fue configurado para volver a:

```txt
https://preview.tugeocercas.com/billing/return?lang=es
```

Validación actual:

- PRO → flujo TEST → `/billing/return?lang=es` OK.
- Enterprise → flujo TEST → `/billing/return?lang=es` OK.

## 6. Productos externos TEST

| Plan interno | Producto externo TEST | Precio | Periodicidad |
|---|---|---:|---|
| `pro` | `pdt_0NhoMPN43aL0XnHSZhrTk` | USD 29 | mensual |
| `enterprise` | `pdt_0NhoND6E41RsKWVP43fW1` | USD 99 | mensual |

Regla: copiar IDs y payment links directamente desde Dodo. No transcribir manualmente caracteres ambiguos como `0` y `O`.

## 7. Eventos esperados

La lista exacta debe confirmarse en la documentación oficial de Dodo antes de implementar. Conceptualmente, el sistema debe prepararse para eventos de:

- checkout completado;
- suscripción creada;
- suscripción renovada;
- pago exitoso;
- pago fallido;
- suscripción cancelada;
- suscripción expirada;
- reembolso o disputa, si aplica;
- actualización de cliente o suscripción, si aplica.

No asumir nombres exactos de eventos hasta consultar la documentación oficial y validar payloads en Test Mode.

## 8. Idempotencia

Todo evento externo debe procesarse una sola vez.

Diseño conceptual:

```txt
external_event_id + billing_provider + environment
```

Debe existir una forma interna de registrar:

- evento recibido;
- fecha de recepción;
- proveedor;
- ambiente (`test` / `live`);
- tipo de evento;
- estado de procesamiento;
- organización resuelta;
- plan resuelto;
- errores de procesamiento;
- payload resumido o payload completo, según política de seguridad.

No guardar datos sensibles de tarjetas, credenciales, códigos 2FA ni secretos.

## 9. Mapeo producto externo → plan interno

El backend no debe confiar en parámetros del navegador para decidir el plan.

El plan debe resolverse con un mapa controlado:

```txt
Dodo TEST product pdt_0NhoMPN43aL0XnHSZhrTk → plan interno pro
Dodo TEST product pdt_0NhoND6E41RsKWVP43fW1 → plan interno enterprise
```

En LIVE deben existir IDs separados y ambiente separado.

Nunca mezclar IDs TEST y LIVE.

## 10. Resolución de organización

Tema pendiente de diseño después de auditar la base.

Opciones posibles:

1. metadata en checkout con `org_id`, validada server-side;
2. vinculación por `external_customer_id`;
3. tabla interna de sesiones de checkout;
4. flujo manual/asistido para Enterprise.

No elegir una opción definitiva hasta auditar tablas actuales de organizaciones, usuarios, billing, planes, perfiles y RLS.

## 11. Estados internos de suscripción

Estados conceptuales sugeridos:

- `free`
- `trialing`
- `active`
- `past_due`
- `canceled`
- `expired`
- `paused`
- `manual_review`

La tabla real y nombres exactos deben confirmarse mediante auditoría SQL read-only.

## 12. Auditoría obligatoria antes de implementar

Antes de cualquier SQL o Edge Function, ejecutar solo auditoría read-only sobre:

- tablas de organizaciones;
- tablas de usuarios/perfiles;
- tablas de planes/billing/suscripciones;
- funciones/RPC existentes;
- RLS policies;
- relaciones y llaves foráneas;
- triggers o vistas relacionadas.

No crear tablas ni columnas hasta documentar estructura actual.

## 13. Seguridad

Reglas mínimas para fase futura:

- El webhook debe validar firma/secreto del proveedor.
- El secreto solo vive en entorno server-side.
- No usar secretos en frontend.
- No pegar secretos en chat.
- No usar `service_role` fuera del backend autorizado.
- Separar variables TEST y LIVE.
- Registrar eventos con idempotencia.
- Fallar cerrado si el evento no se puede validar.
- No activar planes desde rutas públicas de navegador.

## 14. Edge Function futura

Nombre conceptual sugerido:

```txt
dodo-webhook-test
```

O, mejor proveedor-agnóstico:

```txt
billing-webhook
```

Decisión pendiente hasta revisar límites de infraestructura y convenciones actuales de Supabase Edge Functions.

Responsabilidades futuras:

1. recibir evento;
2. validar método HTTP;
3. validar firma;
4. validar ambiente TEST;
5. registrar evento;
6. resolver organización;
7. mapear producto externo a plan interno;
8. actualizar suscripción interna de forma idempotente;
9. devolver respuesta adecuada al proveedor.

## 15. Qué no se implementa todavía

- No webhook endpoint.
- No Edge Function.
- No SQL.
- No tablas nuevas.
- No columnas nuevas.
- No RLS nueva.
- No activación automática.
- No checkout LIVE.
- No cambios en Android.
- No cambios en Production.

## 16. Próximos pasos cuando Supabase responda

1. Recuperar acceso al proyecto `mujwsfhkocsuuahlrssn`.
2. Confirmar que se está en ambiente Preview, no Production.
3. Ejecutar auditoría SQL read-only.
4. Documentar tablas y relaciones reales.
5. Diseñar migración mínima, permanente y proveedor-agnóstica.
6. Implementar webhook TEST.
7. Validar payloads Dodo TEST.
8. Probar idempotencia.
9. Validar actualización interna de plan en Preview.
10. Documentar resultados.
11. Solo después evaluar LIVE con orden expresa.

## Estado final de este documento

Este documento es diseño. No debe usarse como instrucción para ejecutar SQL ni crear funciones hasta recuperar acceso al Supabase correcto y completar la auditoría read-only.
