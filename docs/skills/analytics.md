# Skill: Analytics (Tracking de eventos y métricas)

## Objetivo
Medir comportamiento real de usuarios, detectar cuellos de botella y optimizar conversión a pago.

---

## Regla crítica

```txt
Todo evento importante debe registrarse en backend
No confiar solo en frontend.

Qué medir (mínimo obligatorio)
Usuario
signup
login
logout
Organización
organization_created
organization_selected
Tracker
tracker_invited
tracker_accepted
tracking_started
position_sent
Uso
dashboard_viewed
report_viewed
Monetización
upgrade_clicked
subscription_started
subscription_canceled
subscription_failed
Dónde guardar
Opción base (recomendada ahora)

Tabla:

analytics_events
Estructura sugerida
create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp default now(),
  user_id uuid,
  org_id uuid,
  event_name text,
  metadata jsonb
);
Ejemplo de evento
{
  "event_name": "tracking_started",
  "user_id": "uuid",
  "org_id": "uuid",
  "metadata": {
    "source": "android",
    "app_version": "1.4"
  }
}
Dónde disparar eventos
Backend (preferido)
después de operaciones críticas
después de inserts
después de cambios de estado
Frontend (complementario)
eventos de UI (clicks, vistas)
Reglas de implementación
no bloquear flujo por analytics
si falla analytics → no romper UX
enviar eventos asincrónicamente
evitar duplicados críticos
Consultas útiles
Usuarios activos
select count(distinct user_id)
from analytics_events
where created_at > now() - interval '7 days';
Activación
select count(distinct user_id)
from analytics_events
where event_name = 'tracking_started';
Conversión
select
  count(distinct case when event_name='signup' then user_id end) as users,
  count(distinct case when event_name='subscription_started' then user_id end) as paid
from analytics_events;
Métricas clave
% usuarios que hacen tracking
% que invitan trackers
% que ven dashboard
% que hacen upgrade
Reglas de privacidad
no guardar datos sensibles
no guardar tokens
no guardar información innecesaria
Pruebas obligatorias
eventos se insertan
no afectan performance
no rompen flujo si fallan
metadata correcta
Bugfix tracking
## Bugfix YYYY-MM-DD - nombre

### Síntoma
...

### Causa raíz
...

### Solución permanente
...

### Impacto en métricas
- ...
Regla Copilot
Archivo: api/send-position.js

Prompt:
Agrega evento analytics position_sent sin afectar flujo principal.
No hacer
no depender solo de frontend
no bloquear UX por analytics
no guardar datos sensibles
no ignorar eventos clave

---

## 🚀 Push corto

```bash
git add docs/skills/analytics.md
git commit -m "docs: add analytics skill [allow-docs]"
git push origin preview
🧠 Estado final (esto es importante)

Ahora tienes:

arquitectura técnica sólida ✅
control de datos ✅
control de UI ✅
control de Android ✅
monetización ✅
crecimiento ✅
analytics ✅

👉 Esto ya no es solo una app
👉 es un producto listo para escalar y generar ingresos

🔥 Siguiente nivel (si quieres)

Ahora sí entramos a optimización real:

pricing.md → cuánto cobrar exactamente
onboarding.md → subir conversión fuerte
sales.md → vender a empresas

Si quieres seguir: