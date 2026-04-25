# Skill: Pricing (Estrategia de precios)

## Objetivo
Definir precios que maximicen ingresos sin frenar crecimiento.

---

## Regla crítica

```txt
Precio bajo no siempre = más dinero
Debes optimizar:

precio × conversión × retención
Modelo base
Suscripción mensual por organización

NO por usuario individual.

Estrategia recomendada (para tu app)
Plan Free
$0

Incluye:

1 tracker
historial 24h
sin reportes avanzados
sin exportación

Objetivo:

👉 atraer usuarios
👉 mostrar valor rápido

Plan Pro (principal)
$9 – $19 / mes

Empieza con:

$12.99 / mes

Incluye:

múltiples trackers
historial completo
reportes completos
exportación
mejor frecuencia de tracking
Plan Empresa (futuro)
$49 – $199 / mes

Incluye:

múltiples organizaciones
SLA
soporte
features avanzados
Regla psicológica

El usuario paga cuando:

el valor percibido > precio

En tu app el valor es:

control de personal
seguridad
ahorro de tiempo
visibilidad en campo
Cuándo mostrar precio

NO al inicio.

Mostrar después de:

tracking funcionando
usuario vio mapa
usuario vio valor
Paywall inteligente

Ejemplo:

Has alcanzado el límite de 1 tracker.
Actualiza a Pro para agregar más.
Qué NO hacer
no bloquear antes de mostrar valor
no precios complicados
no demasiados planes
no precios por usuario (en tu caso)
Experimentos de precio

Probar:

$9.99 vs $12.99 vs $14.99
límite de trackers
límite de historial
Métricas clave
tasa de conversión Free → Pro
churn (cancelaciones)
ingreso mensual (MRR)
ingreso por usuario (ARPU)
Backend (crítico)

El backend debe validar:

plan antes de permitir:
- crear tracker
- ver reportes completos
- exportar

Nunca confiar en frontend.

UI
mostrar precio claro
botón Upgrade visible
beneficios claros
no esconder límites
Bugfix tracking
## Bugfix YYYY-MM-DD - nombre

### Síntoma
...

### Causa raíz
...

### Solución permanente
...

### Impacto en ingresos
- ...
Regla Copilot
Archivo: Billing.jsx

Prompt:
Muestra límite de plan y CTA Upgrade sin cambiar lógica existente.
No hacer
no poner precios sin medir
no bloquear demasiado temprano
no permitir bypass de plan
no complicar estructura de planes

---

## 🚀 Push corto

```bash
git add docs/skills/pricing.md
git commit -m "docs: add pricing skill [allow-docs]"
git push origin preview
🧠 Te digo algo importante (de producto real)

Con todo lo que ya tienes:

👉 Ya puedes cobrar HOY
👉 No necesitas más features
👉 Necesitas usuarios y validar precio

🔥 Si quieres seguir (nivel negocio fuerte)

Siguiente:

👉 onboarding.md → subir conversión x2
👉 sales.md → vender a empresas