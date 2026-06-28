# DODO Production Migration Checklist

Fecha: 28 junio 2026  
Proyecto: App Geocercas / GeoField GPS  
Branch operativo actual: `preview`  
Estado: preparación documental y auditoría previa. No ejecutar Production sin orden expresa.

## 1. Objetivo

Preparar la migración ordenada de la integración Dodo desde Supabase Preview hacia Supabase Production, manteniendo separadas las operaciones de Preview y Production.

La integración Dodo TEST en Preview ya fue validada end-to-end con el flujo:

```text
FREE -> PRO TEST -> Enterprise mediante Dodo Change Plan
```

Resultado validado en Preview:

```text
Checkout PRO TEST OK
Webhook PRO OK
Modal de confirmación Enterprise OK
Change Plan PRO -> Enterprise OK
org_billing sincronizado inmediatamente después del Change Plan OK
Billing muestra Enterprise sin reload manual OK
Sin segunda subscription_id dentro del upgrade OK
Production intacta
```

## 2. Reglas obligatorias antes de Production

No hacer push a `main`.

No hacer Promote a Production salvo orden expresa.

No tocar Supabase Production salvo orden expresa.

No mezclar Preview con Production.

No subir datos demo a Production.

No pegar secrets en el chat.

No ejecutar SQL en Production sin auditoría read-only previa.

No desplegar Edge Functions en Production sin orden expresa.

No usar productos Dodo TEST en Production.

No usar secrets TEST en Production.

## 3. Ambientes

### Supabase Preview

```text
Project ref: mujwsfhkocsuuahlrssn
Nombre: pruebatugeo
Uso: pruebas Dodo TEST y validación funcional
```

### Supabase Production

```text
Project ref: wpaixkvokdkudymgjoua
Nombre: My Project
Uso: producción real
```

## 4. Estado actual Preview validado

Preview tiene validado:

```text
Dodo TEST checkout PRO
Dodo TEST checkout Enterprise para pruebas iniciales
Dodo Change Plan PRO -> Enterprise
Webhook firmado dodo-webhook
Tabla dodo_webhook_events
Actualización de org_billing
Protección contra cancelaciones viejas
Protección contra metadata conflictiva
Confirmación visual antes de Change Plan
Sin reload manual después de Enterprise
```

## 5. Fase A — Documentación y preparación

Estado: en curso.

Acciones:

```text
1. Documentar validación final Preview.
2. Crear checklist de migración Production.
3. Preparar SQL read-only de auditoría Production.
4. Preparar lista de variables/secrets LIVE necesarias.
5. Preparar lista de Edge Functions a desplegar cuando se autorice.
```

## 6. Fase B — Auditoría Production read-only

No ejecutar hasta orden expresa.

Objetivo:

```text
Confirmar estructura real de Production antes de preparar SQL o deploy.
```

Auditar:

```text
org_billing columns
org_billing constraints
org_billing RLS
org_entitlements view
plan_limits
v_billing_panel
dodo_webhook_events existence
RLS de dodo_webhook_events
Índices requeridos
Edge Functions existentes
Secrets existentes sin mostrar valores
```

## 7. Fase C — Comparación Preview vs Production

Después de la auditoría read-only, comparar:

```text
Columnas de org_billing
Constraints de provider
Existencia de columnas Dodo
Existencia de tabla dodo_webhook_events
Definición de org_entitlements
Definición de v_billing_panel
RLS activado
Índices disponibles
```

Resultado esperado:

```text
Lista exacta de diferencias.
SQL Production mínimo y seguro.
No ejecutar SQL todavía.
```

## 8. Fase D — Preparar SQL Production exacto

Solo después de comparar estructuras.

El SQL Production debe ser:

```text
Idempotente cuando sea posible.
Mínimo.
Revisable.
Sin datos demo.
Sin tocar organizaciones reales salvo prueba autorizada.
Separado por bloques.
Con verificación posterior.
```

No ejecutar SQL Production hasta aprobación explícita.

## 9. Fase E — Configuración Dodo LIVE

Pendiente fuera de código:

```text
Crear producto Dodo LIVE PRO: USD 29/month
Crear producto Dodo LIVE Enterprise: USD 99/month
Confirmar product_id LIVE PRO
Confirmar product_id LIVE Enterprise
Crear webhook LIVE apuntando a Supabase Production
Obtener signing secret LIVE del webhook
Confirmar modo LIVE habilitado en Dodo
```

No pegar secrets en el chat.

## 10. Fase F — Secrets Production requeridos

Variables esperadas en Supabase Production:

```text
DODO_API_KEY_LIVE
DODO_PRODUCT_ID_PRO_LIVE
DODO_PRODUCT_ID_ENTERPRISE_LIVE
DODO_WEBHOOK_SECRET_LIVE
DODO_APP_BASE_URL
DODO_RETURN_URL_LIVE
DODO_CANCEL_URL_LIVE
```

Opcional si se usa base URL configurable:

```text
DODO_API_BASE_URL
```

Regla:

```text
Los valores se configuran directamente en Supabase/Vercel según corresponda.
No se pegan en el chat.
```

## 11. Fase G — Edge Functions Production

Funciones relevantes:

```text
supabase/functions/dodo-create-checkout/index.ts
supabase/functions/dodo-webhook/index.ts
```

No desplegar a Production hasta orden expresa.

Cuando se autorice, usar project ref Production explícito:

```powershell
supabase functions deploy dodo-webhook --project-ref wpaixkvokdkudymgjoua --no-verify-jwt
supabase functions deploy dodo-create-checkout --project-ref wpaixkvokdkudymgjoua
```

## 12. Fase H — Prueba LIVE controlada

Antes de abrir al público, definir:

```text
Organización de prueba LIVE
Usuario admin de prueba
Método de pago LIVE controlado
Monto esperado
Criterio de éxito
Criterio de rollback
```

Flujo mínimo:

```text
FREE -> PRO LIVE
Webhook actualiza org_billing
PRO -> Enterprise mediante modal de confirmación
Dodo Change Plan LIVE
org_billing Enterprise active
Una sola subscription_id durante el upgrade
Billing muestra Enterprise sin reload manual
```

## 13. Criterios de éxito Production

```text
PRO LIVE compra correctamente.
Webhook firmado procesa eventos.
org_billing queda pro/active/dodo.
Upgrade Enterprise muestra modal de confirmación.
Change Plan usa la misma subscription_id.
org_billing queda enterprise/active/dodo.
Billing y Pricing reconocen Enterprise.
No se crea doble suscripción durante upgrade.
No se muestra provider Dodo al usuario final.
No hay error rojo falso.
```

## 14. Criterios de no avance

No avanzar a Production si ocurre cualquiera de estos casos:

```text
No está claro el schema Production.
Faltan columnas Dodo en org_billing.
Falta dodo_webhook_events.
No se conoce el product_id LIVE.
No está configurado webhook LIVE.
No está configurado signing secret LIVE.
La Edge Function usa secrets TEST.
El Change Plan abre una segunda suscripción.
Billing muestra plan incorrecto.
Hay mezcla de org_id entre localStorage/contexto/billing.
```

## 15. Rollback conceptual

Si una prueba LIVE falla:

```text
No hacer Promote adicional.
No tocar main.
Cancelar o revertir la suscripción desde Dodo si corresponde.
Restaurar org_billing de la organización de prueba con SQL controlado.
Documentar evento y causa.
Corregir primero en Preview.
```

## 16. Estado final de este documento

Este documento solo prepara Production.  
No ejecuta Production.  
No autoriza Promote.  
No autoriza despliegue Production.  
No autoriza SQL Production.
