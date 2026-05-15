# Skill: Reports & Cost Engine

## Objetivo
Mantener reportes, mÃ©tricas y exportaciones consistentes entre dashboard, reports y futuros archivos descargables.

---

## Reglas operativas

- Trabajar solo en branch `preview`.
- No hacer push a `main`.
- No mezclar preview con producciÃ³n.
- No recalcular mÃ©tricas crÃ­ticas en frontend.
- Toda mÃ©trica oficial debe venir de una fuente única.

---

## Fuente Ãºnica de verdad

Para costos:

```txt
public.calculate_tracker_costs_preview
Esta RPC/funciÃ³n debe ser la Ãºnica fuente para:

km_observados
horas_observadas
porcentaje_cobertura
nivel_confianza
costo_total
hourly_rate
km_rate

Dashboard y Reports deben mostrar los mismos valores.

Regla crÃ­tica

Si /reports y /dashboard-costs muestran mÃ©tricas diferentes:

El bug estÃ¡ en la arquitectura, no en el formato visual.

No corregir solo un componente.
Corregir fuente, RPC o consumo comÃºn.

Reportes GPS

Reportes esperados:

posiciones por tracker
recorrido por periodo
Ãºltima posiciÃ³n
distancia observada
horas observadas
cobertura
costos
ExportaciÃ³n futura

Formato recomendado:

Excel / CSV

Filtros mÃ­nimos:

organizaciÃ³n
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
mostrar tabla/grÃ¡fico
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
No duplicar fÃ³rmulas en componentes React.
No calcular distancia final en frontend si existe RPC.
No cambiar nombres de mÃ©tricas sin actualizar docs.
No crear endpoint paralelo si ya existe fuente oficial.
Si se crea nueva mÃ©trica, documentarla aquÃ­.
Archivos tÃ­picos
src/pages/Reports.jsx
src/pages/DashboardCosts.jsx
supabase/migrations/
supabase/functions/
docs/
Pruebas obligatorias

Validar en preview:

/reports carga.
/dashboard-costs carga.
Mismas fechas + mismo tracker = mismas mÃ©tricas.
No hay diferencias de redondeo importantes.
No hay recalculo oculto en frontend.
Export futuro respeta filtros.
Bugfix tracking

Cada correcciÃ³n debe agregarse asÃ­:

## Bugfix YYYY-MM-DD - nombre corto

### SÃ­ntoma
...

### Causa raÃ­z
...

### SoluciÃ³n permanente
...

### Archivos modificados
- ...

### Prueba obligatoria
- ...
Regla Copilot

Ejemplo:

Archivo: src/pages/Reports.jsx

Prompt:
No recalcules mÃ©tricas. Usa los valores devueltos por la RPC existente.
No hacer
No duplicar cÃ¡lculos.
No corregir solo visualmente.
No mezclar lÃ³gica de costos con tracking.
No crear mÃ©tricas nuevas sin documentarlas.
No tocar producciÃ³n sin orden clara.

Push corto:

```bash
git add docs/skills/reports.md
git commit -m "docs: add reports skill [allow-docs]"
git push origin preview
```

---

## Cambio en fuente de datos de /api/reportes?action=report

- El endpoint `/api/reportes?action=report` **ya no utiliza** la vista `v_reportes_diario_con_asignacion`.
- Ahora utiliza la RPC oficial `calculate_tracker_costs_preview` como fuente de datos.
- Las fechas de inicio y fin son **obligatorias** en la llamada a la RPC.
- Se mantienen los filtros y parÃ¡metros compatibles con la lÃ³gica de filtrado usada en `Reports.jsx`.
- Este cambio asegura consistencia y precisiÃ³n en los reportes generados desde el dashboard y las exportaciones.

---

## Nombres humanos en reportes de asistencia

Desde mayo 2026, el endpoint `/api/reportes?action=report` enriquece cada fila con los campos `tracker_nombre`, `geofence_nombre` y `activity_nombre` antes de paginar. El frontend (`Reports.jsx`) ahora renderiza estos nombres humanos en la tabla, y ya no muestra los IDs tÃ©cnicos (como user_id, assignment_id, activity_id, geocerca_id) al usuario final.

**Regla:**
- Los reportes de asistencia y costos deben mostrar nombres legibles para personas y actividades, y no exponer identificadores internos en la UI.
- Los IDs siguen presentes en la respuesta para trazabilidad, pero la tabla principal solo muestra los nombres.

- La RPC `calculate_tracker_costs_preview` debe leer `tracker_positions` y `asignaciones`, no las fuentes legacy `positions` ni `tracker_assignments`.

---

## Formato de moneda en reportes

- Reports.jsx debe formatear los campos `costo_total` y `costo_final` usando `Intl.NumberFormat`, pasando el `currency_code` de cada fila y el locale de `i18n.language` para mostrar el símbolo de moneda correcto según el idioma y la moneda.
- Ejemplo: para USD y locale `es-MX`, se mostrará `$26.62`.

- La RPC `calculate_tracker_costs_preview` debe incluir únicamente posiciones de `tracker_positions` que estén dentro de la geofence activa asignada, usando validación espacial contra `geofences.geom` con `ST_Covers`.

---

## Consumo de costos para dashboard

- El endpoint `/api/reportes?action=costs` **debe reutilizar** la RPC oficial `calculate_tracker_costs_preview` como fuente única de datos.
- Debe aplicar los **mismos filtros** de personal, geocerca y actividad que el endpoint `/api/reportes?action=report`.
- Cada fila devuelta debe transformarse al shape compatible con `CostosDashboardPage`:
    - `horas` = `horas_observadas`
    - `costo_base` = `costo_total`
    - `costo_final` = `costo_total`
    - Además, debe enriquecer cada fila con los nombres humanos: `personal_nombre`, `geocerca_nombre`, `actividad_nombre` (usando la misma lógica de enriquecimiento que en `action=report`).
- Los campos originales de la RPC se conservan para trazabilidad, pero la UI solo debe mostrar los nombres y métricas legibles.

**Regla:** No duplicar lógica de cálculo ni de enriquecimiento de nombres en frontend. Toda la transformación y enriquecimiento debe ocurrir en backend antes de devolver los datos al dashboard.

---

## UI de filtros y agrupación en Reports.jsx

- Desde mayo 2026, la interfaz de Reports.jsx utiliza filtros compactos tipo dropdown multiselección para geocercas, personas, actividades y asignaciones.
- Las asignaciones se muestran y seleccionan usando etiquetas humanas (persona + geocerca + actividad), sin exponer IDs internos en la UI.
- El usuario puede agrupar o desagrupar filas del reporte al estilo Excel por cualquier columna disponible, incluida la fecha, mostrando totales y permitiendo expandir/colapsar niveles de agrupación.
- Los totales y subtotales se calculan dinámicamente según el nivel de agrupación expandido.

**Regla:** La experiencia de filtrado y agrupación debe ser intuitiva, rápida y sin exponer identificadores técnicos al usuario final.
