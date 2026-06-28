# Monetization Home Free Fallback Fix

Fecha: 28 junio 2026  
Branch: preview  
Alcance: fix visual/funcional en Inicio para monetización

## 1. Objetivo

Corregir la tarjeta **Resumen del plan** en la página Inicio para que una organización sin billing activo ni entitlements válidos no aparezca como Starter o Pro por fallback.

La regla permanente debe ser:

```text
Sin org_billing activo confirmado
+ sin org_entitlements válido
= Free
```

## 2. Archivo modificado

```text
src/pages/Inicio.jsx
```

## 3. Problema encontrado

La sección `PlanSection` calculaba `currentPlan` con fallback final a:

```text
starter
```

Además, el `planLabel` no contemplaba explícitamente el plan `free`, por lo que cualquier valor distinto de `enterprise` o `pro` terminaba mostrándose como Starter.

Esto podía producir una lectura incorrecta del plan en Inicio, especialmente para organizaciones nuevas o sin fila en `org_billing`.

## 4. Cambio aplicado

Se cambió el fallback final de:

```text
starter
```

a:

```text
free
```

También se agregó manejo explícito para:

```text
starter
free
```

Resultado esperado:

```text
enterprise -> Enterprise
pro        -> Pro
starter    -> Starter
free       -> Free
```

## 5. Resultado esperado en Preview

Para una organización sin fila en `org_billing` ni `org_entitlements`:

```text
Inicio -> Resumen del plan -> Free
Botón -> Suscribirme a PRO
```

No debe aparecer Pro salvo que exista billing o entitlement válido que lo confirme.

## 6. Impacto

No modifica Supabase.

No modifica Edge Functions.

No modifica Dodo.

No modifica checkout.

No modifica webhook.

No toca Production.

## 7. Validación requerida

En Vercel Preview:

```text
1. Iniciar sesión con una org sin org_billing.
2. Abrir /inicio.
3. Confirmar que Resumen del plan muestra Free.
4. Confirmar que el botón principal ofrece PRO.
5. Ir a /billing y /pricing para confirmar coherencia.
6. Continuar con la prueba FREE -> PRO TEST -> Enterprise Change Plan.
```

## 8. Seguridad

No hacer push a main.

No tocar Supabase Production.

No hacer Promote salvo orden expresa.

No subir datos demo a Production.
