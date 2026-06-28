# DODO Change Plan Auto Refresh Final Fix

Fecha: 28 junio 2026  
Branch: preview  
Ambiente: Supabase Preview  
Alcance: UX posterior a PRO -> Enterprise con Dodo Change Plan

## 1. Problema

El flujo técnico de Dodo Change Plan quedó validado:

```text
FREE -> PRO TEST -> PRO active -> Enterprise active
```

Dodo emitió `subscription.plan_changed` y `org_billing` quedó en Enterprise active. Sin embargo, después de confirmar el cambio a Enterprise, la pantalla podía seguir mostrando PRO hasta que el usuario hacía reload manual.

## 2. Causa probable

El cambio de plan se completa vía webhook y la UI puede conservar estado anterior de React mientras se actualiza `org_billing`.

Aunque la base ya queda correcta, la experiencia visual no debe depender de un reload manual.

## 3. Archivo actualizado

```text
src/components/Billing/UpgradeToProButton.tsx
```

## 4. Cambio aplicado

Después de ejecutar Change Plan o detectar que Enterprise ya está activo, el botón ahora fuerza una navegación dura hacia Billing:

```text
/billing?lang=<lang>&upgrade=enterprise&billing_refresh=<timestamp>&source=dodo_change_plan
```

La navegación usa `window.location.replace()` para obligar a la página de Billing a recargar estado desde Supabase, no solo a cambiar ruta dentro de React.

También se agregó un fallback con `window.location.href` si el navegador no navega correctamente durante un estado de carga.

## 5. Resultado esperado

Después de confirmar el modal:

```text
PRO active
-> clic Subir a Enterprise
-> modal visible
-> Confirmar cambio
-> Dodo Change Plan
-> webhook actualiza org_billing
-> navegación automática a Billing
-> Billing muestra Enterprise active sin reload manual
```

## 6. Validaciones requeridas

Probar en Preview:

```text
1. Rebajar org de prueba a Free.
2. Comprar PRO TEST.
3. Confirmar que muestra PRO.
4. Clic Subir a Enterprise.
5. Confirmar que aparece modal.
6. Confirmar cambio.
7. La app debe navegar a Billing automáticamente.
8. Billing debe mostrar Enterprise active sin reload manual.
9. No debe aparecer error rojo falso.
10. Confirmar en dodo_webhook_events que PRO y Enterprise usan la misma subscription_id para ese upgrade.
```

## 7. Seguridad

No se tocó Production.  
No se hizo Promote.  
No se cambió schema SQL.  
No se cambiaron secrets.  
No se abrió checkout Enterprise nuevo para una org PRO activa.
