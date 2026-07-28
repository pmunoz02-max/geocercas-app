# Protección de `/inicio` con `RequireOrg` — Preview

Fecha: 2026-07-28
Entorno: exclusivamente Preview
Rama: `preview`

## Problema

Una cuenta autenticada nueva, sin membresía en ninguna organización, podía abrir
`/inicio`. La pantalla `Inicio.jsx` interpretaba la ausencia de organización y
rol como si el usuario fuera un tracker y mostraba el onboarding de tracking.

Esto impedía que el usuario llegara al flujo existente de creación de
organización:

```text
/onboarding/create-org
```

## Causa

La ruta `/inicio` no estaba protegida por el componente canónico
`src/components/RequireOrg.jsx`.

Ese componente ya contiene la regla que redirige a un usuario autenticado sin
organización hacia `/onboarding/create-org`.

## Cambio

Se envolvió únicamente el elemento de la ruta `/inicio` con `RequireOrg`:

```jsx
<Route
  path="/inicio"
  element={
    <RequireOrg>
      <Inicio />
    </RequireOrg>
  }
/>
```

No se modificaron otras rutas, guards, componentes de autenticación ni la lógica
especial de trackers.

## Comportamiento esperado

- Usuario autenticado sin organización: redirección a
  `/onboarding/create-org`.
- Usuario con organización activa: acceso normal a `/inicio`.
- Tracker con membresía aceptada: conserva su organización y rol `tracker`.
- La ruta `/onboarding/create-org` queda fuera de `RequireOrg`, evitando un
  bucle de redirección.

## Validación manual en Preview

1. Iniciar sesión en el deployment de Preview con una cuenta sin organización.
2. Abrir `/inicio`.
3. Confirmar la redirección automática a `/onboarding/create-org`.
4. Crear una organización de prueba.
5. Confirmar que el usuario queda registrado como `owner` en
   `public.org_members`.
6. Confirmar que la aplicación permite entrar a `/inicio`.
7. Probar por separado una cuenta tracker con invitación aceptada y verificar
   que conserva el flujo de tracking correspondiente.

## Límites de este cambio

- No incluye cambios SQL.
- No modifica Supabase Producción.
- No modifica la rama `main`.
- No cambia `Inicio.jsx`.
- No corrige textos o correos fijos que puedan existir en otras pantallas.
- No debe incluir datos DEMO en Producción.Fecha: 2026-07-28
Entorno: exclusivamente Preview
