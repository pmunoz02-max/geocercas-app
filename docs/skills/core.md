Arquitectura Oficial Geocercas
# Geocercas App — Core Architecture (Single Source of Truth)

## 🎯 Objetivo
Definir la arquitectura oficial del sistema para evitar inconsistencias en:
- Billing
- Pricing
- Android vs Web
- Base de datos
- Flujos de usuario

---

# 🧠 MODELO DE NEGOCIO

## SaaS basado en suscripción

- Plan Free
- Plan Pro → USD 29/mes
- Plan Enterprise → USD 99/mes

## Regla clave

El pago SIEMPRE ocurre en web (Paddle).  
La app Android NO procesa pagos.

---

# 📱 ANDROID vs WEB (CRÍTICO)

## Android App

Rol:
- Cliente operativo (tracker GPS)

Permitido:
- Ver plan actual
- Usar tracking
- Mostrar estado

NO permitido:
- Botones de compra
- Links a Paddle
- Upgrade dentro de la app

Mensaje permitido:
"Gestiona tu suscripción desde la web"

---

## Web App

Rol:
- Canal de venta
- Gestión de cuenta
- Billing

Flujo:

Landing → Pricing → Checkout Paddle → Webhook → DB → Acceso

---

# 💳 BILLING (PADDLE)

## Estado actual

- Paddle Sandbox → OK
- Paddle Webhook → OK
- Paddle Checkout → OK
- Paddle Live → PENDING (verification)

## Flujo

1. Usuario compra plan en web
2. Paddle procesa pago
3. Webhook recibe evento
4. Backend actualiza DB

---

## Eventos clave

- subscription_created
- subscription_updated
- subscription_canceled

---

# 🗄️ BASE DE DATOS

## Tabla principal

```sql
organizations

Campos clave:

plan
billing_status
Regla de oro

La DB es la única fuente de verdad.

NO recalcular en frontend.

🔗 RELACIÓN USUARIO
Owner/Admin paga
Trackers NO pagan
Trackers usan app Android
🌐 LANDING (REQUERIDO POR PADDLE)

Debe tener:

Acceso público (/)
Pricing visible
CTA claro (Empezar)
Email de contacto:
soporte@tugeocercas.com
Legal:
/privacy
/terms
⚠️ ERRORES A EVITAR

❌ Duplicar precios en múltiples archivos
❌ Cambiar pricing sin actualizar i18n
❌ Agregar pagos dentro de Android
❌ Usar emails tipo Gmail para verificación
❌ Múltiples fuentes de verdad

🧩 PRINCIPIOS DEL SISTEMA
Una sola fuente de verdad (DB)
Web = ventas
Android = operación
Paddle = billing externo
Docs deben reflejar estado real
🚀 ESTADO ACTUAL
Landing pública → OK
Pricing correcto → OK
Legal pages → OK
Email business → OK
Paddle → pendiente verificación
🔜 SIGUIENTE PASO

Esperar aprobación Paddle → activar LIVE checkout

🧠 NOTA FINAL

Este archivo reemplaza documentación anterior.

Cualquier cambio de arquitectura debe reflejarse aquí.


---