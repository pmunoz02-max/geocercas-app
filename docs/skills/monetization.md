# Skill: Monetization (GeocercasApp)

## Objetivo
Definir un sistema de monetización claro, escalable y alineado a la arquitectura actual (Supabase + Vercel + Android + Paddle).

---

## Modelo base

Modelo recomendado:

```txt
SaaS por organización (subscription)
Unidad de cobro:

organization (no usuario individual)
Planes sugeridos
Free
1 tracker
historial limitado (ej: 24h)
sin reportes avanzados
sin exportación
Pro
múltiples trackers
historial completo
reportes completos
exportación (Excel/CSV)
prioridad en procesamiento
Enterprise (futuro)
múltiples organizaciones
SLA
API access
soporte dedicado
Fuente de verdad

Suscripciones se manejan en:

Paddle

Nunca inventar estado en frontend.

Regla crítica
Toda restricción de plan debe validarse en backend

No confiar en frontend para limitar features.

Qué monetizar (clave en tu app)
1. Número de trackers
Free: 1
Pro: ilimitado o limitado alto
2. Historial de datos
Free: 24h
Pro: ilimitado
3. Reportes
Free: básicos
Pro: completos + exportables
4. Frecuencia de tracking (opcional)
Free: cada X minutos
Pro: más frecuente
5. Exportación
Solo Pro
Arquitectura de control

Debe existir validación en:

Backend (Supabase / API)

Ejemplo:

if plan == free and trackers > 1 → reject
Tabla esperada (conceptual)
subscriptions
organizations
organization_members

Campos clave:

organization_id
plan
status
current_period_end
Estados de suscripción
active
trialing
past_due
canceled
paused
Reglas de UI
Mostrar plan actual claramente
Mostrar límites del plan
Mostrar upgrade claro
No bloquear sin explicación
CTA visible: "Upgrade"
Reglas backend
Validar plan antes de:
crear tracker
consultar reportes completos
exportar datos
No permitir bypass desde frontend
Integración con Paddle
Crear suscripción
Cancelar
Suspender
Manejar estados
Manejar errores (ej: pending changes)
Pruebas obligatorias

Validar:

usuario free no puede exceder límites
usuario pro sí puede
downgrade respeta límites
upgrade se refleja correctamente
billing UI consistente
Bugfix tracking
## Bugfix YYYY-MM-DD - nombre

### Síntoma
...

### Causa raíz
...

### Solución permanente
...

### Archivos modificados
- ...

### Prueba
- ...
Estrategia de ingresos

Objetivo:

convertir organizaciones activas en suscripciones pagas

Métricas clave:

número de organizaciones
número de trackers activos
uso de reportes
tasa de conversión Free → Pro
No hacer
no monetizar en frontend
no bloquear sin mensaje claro
no permitir bypass
no mezclar planes con roles
no depender solo de UI para restricciones

---

## 🚀 Push corto

```bash
git add docs/skills/monetization.md
git commit -m "docs: add monetization skill [allow-docs]"
git push origin preview