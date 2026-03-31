CHANGE_IMPLEMENTATION_PROTOCOL.md
# CHANGE_IMPLEMENTATION_PROTOCOL

Este documento define el protocolo oficial para implementar cambios técnicos en **App Geocercas**.

El objetivo es garantizar que cualquier modificación:

- sea segura
- sea reversible
- pueda probarse en preview
- no rompa producción
- no rompa la arquitectura existente
- pueda implementarse correctamente con Copilot

Este protocolo aplica a cambios en:

- frontend
- backend
- base de datos
- pipelines
- motor de geofencing
- lógica SaaS
- infraestructura

---

# Principio Fundamental

Los cambios deben realizarse **en iteraciones pequeñas y verificables**.

Nunca implementar:

- múltiples cambios estructurales al mismo tiempo
- migraciones sin entender el schema
- cambios masivos sin validación intermedia

Cada cambio debe poder:

- probarse en preview
- revertirse fácilmente
- validarse de forma independiente

---

# Entorno de Trabajo

El desarrollo se realiza únicamente en:


preview


Nunca se debe:

- hacer push directo a `main`
- ejecutar migraciones directamente en producción
- mezclar cambios experimentales con código estable

Producción solo se actualiza mediante:


Promote to Production


desde un deployment validado en preview.

---


# Protocolo de Implementación de Cambios

Cada cambio debe seguir las siguientes fases.

## Migración Billing Preview (Paddle)

- No mezclar preview con producción
- No hacer push a main sin validar migración
- Toda migración de billing requiere update de docs
- Ver [PADDLE_PREVIEW_MIGRATION.md](./PADDLE_PREVIEW_MIGRATION.md)

---

# Fase 1 — Entender el Problema

Antes de modificar código se debe identificar:

- qué comportamiento está fallando
- qué parte del sistema está involucrada
- qué capa del sistema es responsable

Las capas posibles son:

- frontend
- backend
- base de datos
- motor de tracking
- motor de geofencing
- capa SaaS

## Regla crítica

No implementar soluciones antes de entender en qué capa debe resolverse el problema.

Consultar:


docs/SYSTEM_BOUNDARIES.md


---

# Fase 2 — Validar el Contexto Técnico

Antes de modificar código o SQL, verificar:

- estructura real de tablas
- relaciones existentes
- impacto en RLS
- impacto en pipeline de tracking
- impacto en geofencing

Consultar:


docs/DB_SCHEMA_MAP.md


Si el schema no está claro:

solicitar primero el SQL de definición de la tabla.

---

# Fase 3 — Diseñar el Cambio Mínimo Seguro

El objetivo es encontrar:

**la modificación más pequeña posible que resuelva el problema.**

Evitar:

- refactors grandes
- cambios simultáneos en múltiples sistemas
- migraciones innecesarias

Preferir:

- cambios localizados
- cambios incrementales
- mejoras progresivas

---

# Fase 4 — Preparar Instrucciones para Copilot

Cuando se implementen cambios con Copilot, las instrucciones deben incluir:

1. archivo a modificar
2. bloque de código actual
3. bloque de código nuevo
4. explicación del cambio
5. comportamiento que no debe romper

Ejemplo:

Archivo:


src/services/trackingService.ts


Bloque actual:

```ts
// código existente

Bloque nuevo:

// código actualizado

Objetivo:

corregir evaluación de geofence sin afectar pipeline.

Fase 5 — Implementar el Cambio

Aplicar el cambio en el código siguiendo estas reglas:

modificar solo lo necesario

no alterar lógica no relacionada

mantener naming consistente

evitar duplicar lógica existente

Si el cambio requiere SQL:

no ejecutarlo sin validar primero impacto en datos y RLS.

Fase 6 — Validar en Preview

Después del cambio verificar:

que la aplicación compile

que las rutas principales funcionen

que el pipeline de tracking no se rompa

que la visualización de mapas funcione

que los eventos de geofencing sigan generándose

que RLS siga aplicándose correctamente

Fase 7 — Deploy en Preview

Una vez validado localmente:

realizar push al branch:

preview

Esto generará un deployment en Vercel.

Verificar:

que el deployment se complete correctamente

que la aplicación funcione en el entorno preview

que no existan errores en consola o logs

Fase 8 — Observación

Después del deploy en preview monitorear:

errores en consola

errores de red

queries fallidas

comportamiento inesperado

impacto en geofencing o tracking

Si algo falla:

revertir el cambio inmediatamente.

Fase 9 — Documentar el Cambio

Actualizar documentación si el cambio afecta:

schema

pipeline de tracking

motor de geofencing

límites SaaS

arquitectura del sistema

Los documentos que pueden requerir actualización incluyen:

DB_SCHEMA_MAP.md

DATA_FLOW.md

ARCHITECTURE_DIAGRAMS.md

Fase 10 — Preparar Promoción a Producción

Solo cuando:

el cambio está probado

preview funciona correctamente

no existen errores operativos

entonces se puede considerar:

Promote to Production

Nunca promover cambios no verificados.

Protocolo para Cambios de Base de Datos

Si el cambio involucra SQL:

seguir además:

docs/SCHEMA_EVOLUTION_STRATEGY.md

Nunca ejecutar:

ALTER TABLE

DROP COLUMN

DROP TABLE

sin análisis previo.

Protocolo para Cambios en Tracking

Tablas críticas:

positions

tracker_geofence_events

tracker_latest

Estas tablas participan en el pipeline oficial.

Cambios en estas tablas requieren:

análisis de impacto

pruebas en preview

validación de generación de eventos

Protocolo para Cambios en Geofencing

Documentación:

docs/GEOFENCE_ENGINE_ARCHITECTURE.md

docs/GEOFENCE_EVENT_RULES.md

No introducir nuevas reglas sin validación.

Eventos oficiales:

ENTER

EXIT

Protocolo para Cambios SaaS

Si el cambio afecta:

límites

features

billing

verificar compatibilidad con:

docs/SaaS_LIMITS_AND_ENTITLEMENTS.md
Anti-Patterns Prohibidos

Quedan prohibidos:

cambios grandes en un solo commit

ejecutar SQL sin validar schema

mezclar múltiples refactors en una iteración

modificar lógica sin entender el pipeline

corregir errores estructurales solo con frontend

romper RLS para resolver bugs

hacer bypass de org_id

deploy directo a producción

Regla Final

Todo cambio debe seguir este principio:

cambio pequeño → prueba en preview → validación → documentación → posible promoción a producción

La estabilidad del sistema siempre tiene prioridad sobre la velocidad de implementación.