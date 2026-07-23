# Paddle Live Readiness Audit - 2026-07-23

Fecha: 2026-07-23
Estado: Cerrada
Ámbito: Evaluación de readiness de Paddle para Live

## Resumen Ejecutivo

- Dodo es el proveedor principal vigente en Preview.
- Paddle queda bloqueado para entorno Live.
- Todo el trabajo relacionado con Paddle se mantiene exclusivamente en entorno preview.

## Decisión Operativa

Hasta nuevo aviso:

1. No se habilita Paddle en Live.
2. No se promueven cambios de Paddle desde preview a Live.
3. Las validaciones, pruebas e iteraciones continúan solo en preview.

## Hallazgos Críticos de la Auditoría Paddle

### 1) Webhook

- Riesgo detectado: cobertura incompleta de eventos críticos para ciclo de vida de suscripción y pagos.
- Riesgo detectado: el webhook de Paddle continúa con firma inválida y controles de replay no cerrados para un escenario Live endurecido.
- Riesgo detectado: manejo parcial de fallos transitorios y reintentos sin trazabilidad consolidada de reconciliación.
- Impacto: posible divergencia entre estado de Paddle y estado interno de negocio ante eventos fuera de orden o repetidos.

### 2) Autorización de Checkout

- Riesgo detectado: la autorización de creación/uso de checkout no valida suficientemente usuario, membresía, rol y org_id.
- Riesgo detectado: validaciones de contexto de sesión y ownership no finalizadas para todos los caminos de acceso.
- Impacto: posibilidad de emitir checkout en contexto incorrecto o no autorizado en escenarios límite.

### 3) Idempotencia

- Riesgo detectado: estrategia de idempotencia no consolidada de extremo a extremo (checkout, webhook, actualización de estado).
- Riesgo detectado: llaves idempotentes y deduplicación con cobertura parcial para concurrencia y reintentos.
- Impacto: riesgo de doble procesamiento, actualización duplicada de estado o inconsistencias temporales.

### 4) Variables y Configuración

- Riesgo detectado: matriz de variables de entorno (preview/live) pendiente de cierre operativo y validación automática.
- Riesgo detectado: guardrails para evitar mezcla de credenciales/endpoints entre entornos aún no completados.
- Impacto: errores de configuración con potencial de afectar seguridad, facturación o trazabilidad.

### 5) Planes y Límites

- Riesgo detectado: normalización final entre catálogo de planes, límites oficiales y reglas efectivas en runtime aún en convergencia.
- Riesgo detectado: escenarios de migración/legacy y compatibilidad de límites pendientes de validación integral.
- Impacto: asignación de entitlements/límites incorrecta en casos borde.

### 6) Rutas Residuales

- Riesgo detectado: existencia de rutas/flujo residuales de billing que deben cerrarse o aislarse antes de Live.
- Riesgo detectado: puntos de entrada legacy aún presentes que pueden introducir comportamiento no deseado.
- Impacto: ambigüedad operacional y mayor superficie de error en producción.

## Pendientes para habilitación Live de Paddle

1. Cerrar cobertura de eventos webhook, validación de firma y defensa anti-replay con pruebas de estrés.
2. Endurecer autorización de checkout para todos los contextos multi-tenant y casos de sesión.
3. Completar idempotencia end-to-end con pruebas de concurrencia y reintentos.
4. Blindar variables por entorno con validaciones de arranque y políticas de despliegue.
5. Consolidar planes/límites con matriz oficial única y pruebas de regresión funcional.
6. Eliminar o bloquear rutas residuales de billing antes de cualquier promoción a Live.

## Implementación 1: firma fail-closed

- Se implementó validación fail-closed para firma del webhook de Paddle.
- Respuesta 401 y terminación inmediata cuando:
	- Falta el header `Paddle-Signature`.
	- El formato de firma es inválido.
	- Existe mismatch entre firma recibida y firma calculada.
	- Ocurre error durante la validación de firma.
- Se eliminó el registro de firmas recibidas o calculadas en logs.
- Estado de despliegue: esta actualización aún no se desplegó en Supabase Preview.

## Estado de Go-Live

- Decisión: NO GO para Paddle en Live al 2026-07-23.
- Continuidad: Dodo se mantiene como proveedor principal vigente en Preview.
- Entorno permitido para Paddle: solo preview.

## Nota

Este documento resume el estado de readiness y la decisión de despliegue al 2026-07-23.
