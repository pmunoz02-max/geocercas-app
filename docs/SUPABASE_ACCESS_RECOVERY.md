# Supabase access recovery — Preview y Producción

Fecha: 2026-06-26  
Estado: **ACCESO TÉCNICO CLI RECUPERADO / DASHBOARD WEB PENDIENTE**

## 1. Objetivo

Documentar la recuperación operativa de los proyectos Supabase existentes usados por GeoField GPS, sin crear proyectos nuevos, sin cambiar variables de Vercel y sin mezclar Preview con Producción.

## 2. Mapa real actual

La fuente de verdad operativa actual es:

1. Variables de entorno actuales en Vercel.
2. Resultado de `supabase projects list`.
3. Backups read-only generados por CLI.

```txt
Preview Supabase    -> mujwsfhkocsuuahlrssn
Preview URL         -> https://mujwsfhkocsuuahlrssn.supabase.co
Preview name CLI    -> pruebatugeo

Production Supabase -> wpaixkvokdkudymgjoua
Production URL      -> https://wpaixkvokdkudymgjoua.supabase.co
Production name CLI -> My Project

Org ID CLI          -> bwsqrbtppzvxowiytsus
```

Regla corregida: **Preview y Producción son proyectos Supabase separados**. No asumir base compartida.

## 3. Estado del dashboard web

Los enlaces directos al dashboard devuelven “no tienes acceso”:

```txt
https://supabase.com/dashboard/org/bwsqrbtppzvxowiytsus
https://supabase.com/dashboard/project/mujwsfhkocsuuahlrssn
https://supabase.com/dashboard/project/wpaixkvokdkudymgjoua
```

Se completó el flujo de verificación de cuenta de Supabase y apareció la confirmación “Account linked”. Aun así, el dashboard web sigue sin membresía visible.

Diagnóstico operativo:

```txt
CLI Supabase: sí accede.
Dashboard Supabase: no accede.
```

Interpretación probable: el token local de CLI pertenece a una identidad con permisos, pero la sesión web actual no está reconocida como miembro de la organización.

## 4. Evidencia CLI recuperada

Comando ejecutado desde el repo principal:

```powershell
supabase projects list
```

Resultado relevante:

```txt
wpaixkvokdkudymgjoua | My Project  | East US (Ohio)
mujwsfhkocsuuahlrssn | pruebatugeo | West US (Oregon) | LINKED
```

El repo principal está linkeado actualmente a Preview:

```txt
mujwsfhkocsuuahlrssn
```

Por seguridad, no se debe ejecutar `supabase link --project-ref wpaixkvokdkudymgjoua` dentro del repo principal.

## 5. Backups read-only generados

### 5.1 Preview

Backup de estructura, sin datos:

```txt
supabase/backups/schema-public-20260626-2110.sql
```

Comando usado:

```powershell
supabase db dump --linked --schema public --file ".\supabase\backups\schema-public-20260626-2110.sql"
```

También se ejecutó:

```powershell
supabase migration list --linked
```

Hallazgo: hay drift importante entre migraciones locales y remotas. No ejecutar comandos automáticos de reparación ni push.

### 5.2 Producción

Producción fue auditada desde carpeta separada fuera del repo principal:

```txt
C:\dev\geocercas-supabase-audit\production
```

Backup de estructura, sin datos:

```txt
backups/schema-production-public-20260626-2143.sql
```

Lista de migraciones:

```txt
backups/migration-list-production-20260626-2143.txt
```

Producción mostró una migración remota registrada:

```txt
20260223180705 | 2026-02-23 18:07:05
```

## 6. Comparación resumida Preview vs Producción

Resumen obtenido desde los dumps read-only:

| Objeto | Preview | Producción |
|---|---:|---:|
| Tablas public | 86 | 73 |
| Vistas public | 16 | 14 |
| Funciones/RPC public | 354 | 298 |
| Policies RLS | 222 | 177 |
| Tablas con RLS enabled | 74 | 68 |
| Tablas con FORCE RLS | 9 | 9 |
| Índices | 241 | 225 |

Conclusión: **Preview está más avanzado que Producción**. No copiar, empujar ni sincronizar automáticamente entre proyectos.

## 7. Edge Functions y secrets

Se listaron funciones y secrets por nombre/digest en ambos proyectos.

### Preview

Funciones relevantes activas:

```txt
stripe-create-checkout
stripe-webhook
stripe-create-portal-session
paddle-create-checkout
paddle-webhook
paddle-cancel-subscription
```

También existen funciones operativas como `send_position`, `accept-tracker-invite`, `invite_tracker`, `send-tracker-invite-brevo` y otras.

### Producción

Funciones relevantes activas:

```txt
stripe-webhook
stripe-create-checkout
stripe-create-portal-session
paddle-create-checkout
paddle-webhook
paddle-cancel-subscription
google_play_rtdn_webhook
verify_google_play_purchase
```

Los secrets se revisaron solo por nombre/digest. No se copiaron ni compartieron valores reales.

## 8. Alertas críticas

### 8.1 No cerrar sesión CLI

La CLI es actualmente la vía de acceso técnico. No ejecutar:

```powershell
supabase logout
supabase login
```

Tampoco actualizar CLI hasta estabilizar el acceso al dashboard.

### 8.2 No desplegar funciones legacy desde local

No se debe desplegar `paddle-webhook`, `stripe-webhook` ni funciones legacy desde el código local sin auditoría. Hay indicios de que el código local puede no coincidir exactamente con lo remoto.

Especialmente prohibido:

```powershell
supabase functions deploy paddle-webhook
supabase functions deploy stripe-webhook
```

### 8.3 No mezclar Preview con Producción

El repo principal queda vinculado a Preview. Producción solo se audita desde carpeta separada.

No ejecutar dentro del repo principal:

```powershell
supabase link --project-ref wpaixkvokdkudymgjoua
```

## 9. Comandos prohibidos hasta nueva orden

No ejecutar en Preview ni Producción:

```powershell
supabase db push
supabase db pull
supabase db reset
supabase migration repair
supabase functions deploy
supabase secrets set
```

Tampoco modificar variables Vercel de Producción ni hacer Promote a Production.

## 10. Impacto en Dodo TEST

Dodo TEST checkout y rutas neutrales de retorno pueden seguir en Preview desde frontend, pero la implementación de webhooks sigue bloqueada hasta completar auditoría técnica y decidir una migración mínima.

Puntos confirmados:

```txt
Dodo TEST checkout: validado en Preview.
Rutas /billing/return, /billing/success, /billing/cancel: neutras.
Activación de plan: no se hace desde frontend.
Webhook Dodo: no implementado todavía.
```

La futura función debe ser nueva y separada:

```txt
dodo-webhook
```

No tocar funciones Stripe/Paddle existentes para implementar Dodo.

## 11. Mensaje técnico para soporte Supabase

Resumen del caso para soporte:

```txt
CLI has access to org bwsqrbtppzvxowiytsus and both projects:
- mujwsfhkocsuuahlrssn
- wpaixkvokdkudymgjoua

Dashboard web still returns no access for org and both projects, even after Account linked verification.
Please restore dashboard membership or identify the account that owns the org.
Do not create new projects and do not modify existing live projects.
```

## 12. Próximos pasos

1. Esperar corrección de membresía/dashboard por Supabase Support.
2. Mantener intacta la sesión CLI actual.
3. No modificar SQL, funciones, secrets ni variables Vercel.
4. Continuar solo con documentación, auditoría read-only y diseño.
5. Antes de webhooks Dodo TEST, revisar con precisión tablas, constraints, RLS y funciones de billing en Preview.
6. Implementar Dodo solo en Preview y solo con orden explícita.
7. Producción queda congelada hasta orden explícita.
