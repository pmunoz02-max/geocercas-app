# Skill: Growth (Adquisición y Conversión)

## Objetivo
Aumentar usuarios, organizaciones activas y conversiones a pago de forma sistemática.

---

## Regla crítica

```txt
Si no mides → no puedes mejorar → no puedes monetizar
Funnel principal
Visita → Registro → Crear organización → Invitar tracker → Usar tracking → Ver valor → Upgrade
Métricas clave
Adquisición
visitas
registros nuevos
costo por usuario (futuro)
Activación (CRÍTICO)

Evento clave:

usuario crea organización + envía primera posición

Si no llega aquí → no entendió el producto.

Engagement
trackers activos
posiciones enviadas
uso de dashboard
uso de reportes
Monetización
organizaciones free
organizaciones pro
tasa de conversión (Free → Pro)
Eventos que debes trackear

Eventos mínimos:

signup
login
organization_created
tracker_invited
tracker_accepted
tracking_started
position_sent
dashboard_viewed
report_viewed
upgrade_clicked
subscription_started
Dónde medir

Opciones:

logs backend (mínimo)
tabla analytics en DB
futuro: herramientas externas
Estrategia inicial (simple y efectiva)
1. Activación rápida

El usuario debe:

crear org
invitar tracker
ver posición en mapa

en menos de 3 minutos

2. Mostrar valor rápido

Después del tracking:

mostrar mapa actualizado
mostrar recorrido
mostrar métricas básicas
3. Paywall inteligente

No bloquear desde el inicio.

Bloquear cuando ya vio valor.

Ejemplo:

"Has alcanzado el límite de 1 tracker. Actualiza a Pro para agregar más."
UI clave para conversión
botón "Upgrade" visible
mostrar límites del plan
mostrar beneficios Pro
mensajes claros, no técnicos
Growth loops

Ejemplo:

Un usuario invita a otro tracker → ese tracker se convierte en nuevo usuario → crea su propia organización
Canales de crecimiento (para tu caso)
Directo (recomendado)
empresas agrícolas
logística
seguridad
supervisión de campo
Viral interno
invitaciones de tracker
uso en equipos
App Stores
optimización en Google Play
screenshots claros
video funcional
Experimentos

Siempre probar:

cambios en onboarding
textos de upgrade
límites free
UX del tracker
Reglas de backend
eventos importantes deben registrarse
no depender solo de frontend
logs claros
Pruebas obligatorias
usuario nuevo entiende flujo
puede llegar a enviar posición
entiende cómo invitar tracker
entiende cuándo pagar
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
No hacer
no lanzar features sin medir
no bloquear antes de mostrar valor
no complicar onboarding
no depender solo de intuición

---

## 🚀 Push corto

```bash
git add docs/skills/growth.md
git commit -m "docs: add growth skill [allow-docs]"
git push origin preview
🧠 Te falta uno clave para cerrar el sistema

👉 analytics.md

Ese es el que conecta todo (growth + monetización + producto)