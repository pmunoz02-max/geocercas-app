# Skill: Reports & Cost Engine

## Objetivo
Mantener reportes, métricas y exportaciones consistentes entre dashboard, reports y futuros archivos descargables.

---

## Reglas operativas

- Trabajar solo en branch `preview`.
- No hacer push a `main`.
- No mezclar preview con producción.
- No recalcular métricas críticas en frontend.
- Toda métrica oficial debe venir de una fuente única.

---

## Fuente única de verdad

Para costos:

```txt
public.calculate_tracker_costs_preview
Esta RPC/función debe ser la única fuente para:

km_observados
horas_observadas
porcentaje_cobertura
nivel_confianza
costo_total
hourly_rate
km_rate

Dashboard y Reports deben mostrar los mismos valores.

Regla crítica

Si /reports y /dashboard-costs muestran métricas diferentes:

El bug está en la arquitectura, no en el formato visual.

No corregir solo un componente.
Corregir fuente, RPC o consumo común.

Reportes GPS

Reportes esperados:

posiciones por tracker
recorrido por periodo
última posición
distancia observada
horas observadas
cobertura
costos
Exportación futura

Formato recomendado:

Excel / CSV

Filtros mínimos:

organización
tracker
fecha inicio
fecha fin

Columnas base:

tracker_name
tracker_user_id
org_id
timestamp
latitude
longitude
speed
accuracy
source
Backend primero

Los reportes pesados deben resolverse en backend/RPC.

Frontend solo debe:

seleccionar filtros
llamar endpoint/RPC
mostrar tabla/gráfico
descargar archivo
SQL antes de modificar reportes

Antes de cambiar funciones o tablas:

select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'positions',
    'tracker_positions',
    'personal',
    'organizations',
    'organization_members'
  )
order by table_name, ordinal_position;

Para funciones:

select
  routine_schema,
  routine_name,
  routine_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name ilike '%tracker%cost%';
Reglas de consistencia
No duplicar fórmulas en componentes React.
No calcular distancia final en frontend si existe RPC.
No cambiar nombres de métricas sin actualizar docs.
No crear endpoint paralelo si ya existe fuente oficial.
Si se crea nueva métrica, documentarla aquí.
Archivos típicos
src/pages/Reports.jsx
src/pages/DashboardCosts.jsx
supabase/migrations/
supabase/functions/
docs/
Pruebas obligatorias

Validar en preview:

/reports carga.
/dashboard-costs carga.
Mismas fechas + mismo tracker = mismas métricas.
No hay diferencias de redondeo importantes.
No hay recalculo oculto en frontend.
Export futuro respeta filtros.
Bugfix tracking

Cada corrección debe agregarse así:

## Bugfix YYYY-MM-DD - nombre corto

### Síntoma
...

### Causa raíz
...

### Solución permanente
...

### Archivos modificados
- ...

### Prueba obligatoria
- ...
Regla Copilot

Ejemplo:

Archivo: src/pages/Reports.jsx

Prompt:
No recalcules métricas. Usa los valores devueltos por la RPC existente.
No hacer
No duplicar cálculos.
No corregir solo visualmente.
No mezclar lógica de costos con tracking.
No crear métricas nuevas sin documentarlas.
No tocar producción sin orden clara.

Push corto:

```bash
git add docs/skills/reports.md
git commit -m "docs: add reports skill [allow-docs]"
git push origin preview