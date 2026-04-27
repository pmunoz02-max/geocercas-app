# Tracker Runtime Session Flow (Final Fix)

## Problema previo

El flujo de invitación estaba devolviendo el `invite_token` como:

- tracker_runtime_token ❌

Esto causaba:

- ERROR invalid_token en /api/send-position
- tracker nunca aparecía como activo
- desalineación entre invite, runtime y tracking

## Solución implementada

Se introduce un flujo correcto de runtime:

1. accept-tracker-invite:
   - valida invite
   - resuelve tracker_user_id desde personal.user_id
   - crea registro en tracker_runtime_sessions
   - genera token aleatorio (runtime token)
   - guarda hash del token
   - devuelve token plano al cliente

2. send-position:
   - recibe Bearer token
   - calcula hash
   - valida contra tracker_runtime_sessions
   - verifica assignment activa
   - inserta posición
   - actualiza tracker_latest
   - actualiza tracker_health

## Resultado esperado

- tracker válido aparece como ACTIVE
- dashboard refleja estado real
- desaparece invalid_token
- flujo tipo Uber funcional

## Nota

Los invites previos al fix no deben reutilizarse.
Siempre generar uno nuevo.

---

## Fix Abril 2026 — claim sub obligatorio

El `tracker_runtime_token` debe incluir siempre:

- `sub = tracker_user_id`
- `tracker_user_id`
- `org_id`

Esto permite que `auth.uid()` y la lógica de `send_position` resuelvan correctamente el usuario tracker.

Código canónico:

```js
const token = jwt.sign(
  {
    sub: tracker_user_id,
    tracker_user_id,
    org_id,
  },
  JWT_SECRET,
  {
    expiresIn: "7d",
  }
);
```
## Fix Abril 2026 — runtime session obligatoria

El `tracker_runtime_token` es tratado como opaco y no se decodifica en `/api/send-position`.

Para que el sistema funcione correctamente, es obligatorio registrar una sesión en `tracker_runtime_sessions` al momento de aceptar la invitación.

Campos requeridos:

- org_id
- tracker_user_id
- access_token_hash = sha256(token)
- token_version = 1
- source = tracker-native-android
- active = true
- issued_at
- expires_at

La Edge Function `send_position` resuelve la identidad del tracker a partir de esta tabla, no desde el JWT.

Sin este registro:

- user_id → null
- tracker_user_id → null
- No hay inserts en positions