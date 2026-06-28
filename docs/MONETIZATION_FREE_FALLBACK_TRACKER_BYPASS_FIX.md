# Monetization Free Fallback and Tracker Bypass Fix

Fecha: 28 junio 2026  
Branch: preview  
Alcance: monetización / entitlements / prueba Dodo TEST

## 1. Contexto

Durante la preparación de la prueba funcional completa:

```text
FREE -> PRO TEST -> PRO active -> Enterprise Change Plan
```

se detectó que una organización visible en la UI aparecía como **Pro**, pero no tenía fila asociada en:

```text
public.org_billing
public.organizations
public.org_entitlements
public.v_billing_panel
```

La auditoría se hizo por Supabase CLI contra Preview.

## 2. Problema encontrado

El hook:

```text
src/hooks/useOrgEntitlements.js
```

tenía un bypass global para usuarios con rol `tracker`:

```text
currentRole === "tracker" -> plan_code = pro, plan_status = active
```

Esto podía provocar que pantallas generales como Inicio/Billing/Pricing mostraran un estado equivalente a **Pro**, aunque no existiera billing activo confirmado.

## 3. Decisión

El bypass de tracker no debe convertir globalmente al usuario u organización en PRO.

La regla permanente de monetización queda:

```text
Sin org_billing activo confirmado
+ sin org_entitlements válido
= Free
```

El bypass de tracker solo debe aplicarse en rutas de tracker:

```text
/tracker
/tracker/*
/tracker-gps
/tracker-gps/*
```

## 4. Archivo actualizado

```text
src/hooks/useOrgEntitlements.js
```

## 5. Cambio aplicado

Antes:

```text
trackerRouteBypass || trackerRoleBypass -> PRO active con límites altos
```

Ahora:

```text
trackerRouteBypass -> bypass solo para rutas tracker
trackerRoleBypass fuera de rutas tracker -> no concede PRO
sin billing/entitlements -> Free
```

El bypass de ruta tracker mantiene acceso operativo al tracker, pero no muestra PRO como plan de suscripción en pantallas generales.

## 6. Resultado esperado

En pantallas generales:

```text
Inicio
Billing
Pricing
PublicPricing
```

si la organización no tiene billing activo ni entitlements válidos, debe verse como:

```text
Free
```

En rutas tracker, el bypass operativo puede seguir permitiendo el uso necesario sin presentar el estado de monetización como PRO global.

## 7. Validación recomendada en Preview

1. Ejecutar `npm run build`.
2. Desplegar en branch `preview`.
3. Abrir Inicio con la organización auditada.
4. Confirmar que ya no aparece como PRO si no tiene billing.
5. Confirmar que Billing/Pricing la reconocen como Free.
6. Comprar PRO TEST desde Preview.
7. Esperar webhook Dodo.
8. Confirmar PRO active.
9. Ejecutar upgrade a Enterprise.
10. Confirmar que no se abre checkout nuevo.
11. Confirmar que Dodo Change Plan usa la suscripción existente.
12. Confirmar Enterprise active en Billing/Pricing.

## 8. Seguridad operativa

No se tocó Production.

No se hizo Promote.

No se modificó schema de base de datos.

No se modificaron secrets.

No se subieron datos demo a Producción.

## 9. Estado

Pendiente de aplicar ZIP, build, deploy Preview y validación visual.
