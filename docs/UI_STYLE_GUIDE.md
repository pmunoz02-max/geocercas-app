# UI_STYLE_GUIDE

## Estándar visual oficial — patrón REPORTES

Este documento define el estándar visual vigente para las páginas internas de **App Geocerca / GeoField GPS**.

El patrón base es la página **REPORTES**. Toda página interna nueva o modificada debe mantener la misma apariencia general, salvo que exista una razón funcional documentada para diferenciarla.

---

## Estado de rollout

Normalización visual ejecutada y validada en Preview, luego promovida a Producción por orden explícita del owner del proyecto.

Páginas alineadas al patrón REPORTES:

- Inicio
- Dashboard / Home
- Reportes
- Planificación
- Benchmarking
- Centro de Ayuda / Guía Rápida
- Actividades
- Asignaciones
- Personal
- Costos
- Costos Dashboard
- Tracker
- Tracker Dashboard
- Billing
- Pricing
- Invitar Tracker

Reglas mantenidas durante el rollout:

- Branch de trabajo: `preview`
- No push a `main`
- Deploy Preview validado antes de Promote
- Promote to Production solo con orden explícita
- No datos demo en Producción
- No cambios de base de datos para la normalización visual

---

## Principios visuales

Las páginas internas deben seguir estos principios:

1. Claridad operativa: el usuario debe entender rápidamente qué módulo está usando y qué acciones puede tomar.
2. Consistencia visual: navegación, headers, tarjetas, filtros, tablas y botones deben sentirse como parte del mismo producto.
3. Separación de responsabilidades: los cambios visuales no deben alterar lógica de negocio, seguridad, tracking, billing, reportes ni consultas.
4. Estados explícitos: toda página debe manejar loading, error, empty state y success cuando aplique.
5. i18n completo: toda UI visible debe mantener paridad ES/EN/FR si el módulo ya usa traducciones.

---

## Layout base

Patrón recomendado para páginas internas:

```txt
main container
  hero/header tipo REPORTES
  filtros o acciones principales
  KPIs o tarjetas resumen
  contenido principal
  tablas / gráficos / estados vacíos
```

Clases visuales frecuentes:

```txt
max-w-7xl
mx-auto
px-4 sm:px-6 lg:px-8
py-6
space-y-6
rounded-3xl
border border-emerald-100
bg-white
shadow-sm / shadow-emerald-100
```

---

## Header tipo REPORTES

Cada página interna debe iniciar con un header visualmente consistente:

- Gradiente emerald/teal.
- Badge superior opcional.
- Título grande.
- Subtítulo descriptivo.
- Acciones principales en un panel translúcido o tarjetas.

Ejemplo conceptual:

```jsx
<section className="rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 p-6 text-white shadow-lg">
  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">Módulo</p>
  <h1 className="mt-2 text-3xl font-bold">Título</h1>
  <p className="mt-2 max-w-3xl text-sm text-emerald-50">Descripción operativa del módulo.</p>
</section>
```

No hardcodear textos si la página ya usa i18n.

---

## Tarjetas y contenedores

Usar tarjetas blancas con borde suave y esquinas redondeadas:

```txt
bg-white
border border-emerald-100
rounded-3xl
shadow-sm
shadow-emerald-100/50
```

Evitar mezclar paletas antiguas azul/slate como estilo principal. Pueden usarse grises neutros para texto secundario, pero el acento visual principal debe ser emerald/teal.

---

## Botones

Botón primario:

```txt
bg-emerald-600
text-white
hover:bg-emerald-700
focus:ring-emerald-500
rounded-xl
```

Botón secundario:

```txt
bg-white
text-emerald-700
border border-emerald-200
hover:bg-emerald-50
rounded-xl
```

Los botones críticos o destructivos pueden usar rojo, pero deben ser explícitos y no confundirse con acciones normales.

---

## Filtros y formularios

Los filtros deben agruparse en paneles consistentes:

- Fondo blanco.
- Borde emerald suave.
- Campos alineados.
- Labels claros.
- Focus emerald.
- Estados disabled explicados.

No mostrar IDs técnicos (`org_id`, `user_id`, tokens, raw JSON) en UI final.

---

## Tablas

Las tablas deben seguir el patrón visual de REPORTES:

- Header con tonos emerald claros.
- Texto de encabezado en uppercase o semibold según la página.
- Bordes suaves.
- Scroll horizontal cuando haya muchas columnas.
- Números alineados a la derecha cuando sean métricas.
- Estados vacíos visibles, no pantallas en blanco.

Para tablas con muchas columnas, se prefiere `overflow-x-auto` y `min-w-*` antes que comprimir información crítica.

---

## KPIs y métricas

Las tarjetas KPI deben mostrar:

- Etiqueta clara.
- Valor principal.
- Descripción breve si aplica.
- Unidad visible cuando el valor pueda confundirse.

Para módulos analíticos como Benchmarking:

- No redondear valores pequeños a falsos ceros.
- Mantener la unidad base (`m²`) y agregar lecturas auxiliares cuando aporten claridad (`ha`, `km²`).
- Mostrar fuente de datos si hay diferencia entre dato planificado y dato auditado.

---

## Gráficos

Los gráficos internos deben mantener:

- Contenedor blanco con borde emerald suave.
- Título y descripción.
- Leyenda clara.
- Valores formateados según unidad.
- Estado vacío si no hay datos suficientes.

No usar gráficos para ocultar falta de datos.

---

## Centro de Ayuda / Guía Rápida

Las tarjetas de ayuda deben seguir el mismo patrón:

- Tarjetas blancas.
- Borde emerald.
- Título corto.
- Descripción breve.
- Puntos clave.
- Botón de acceso al módulo cuando corresponda.

Las tarjetas de Planificación y Benchmarking ya forman parte de la Guía Rápida.

---

## Qué no hacer

No hacer cambios visuales que:

- Cambien lógica de negocio.
- Alteren RLS, auth, billing, tracking o geofencing.
- Cambien queries sin necesidad.
- Oculten errores sin manejarlos.
- Eliminen estados loading/error/empty.
- Muestren datos técnicos al usuario.
- Introduzcan textos hardcodeados en páginas con i18n.
- Rompan mobile para mejorar desktop.

---

## Checklist para nuevas páginas

Antes de cerrar una nueva página interna:

- Usa header tipo REPORTES.
- Usa contenedores y tarjetas emerald/teal.
- Tiene loading, error y empty state.
- Usa i18n si el módulo corresponde.
- No muestra IDs técnicos.
- Los botones tienen estados claros.
- Las tablas tienen scroll horizontal si hace falta.
- Build pasa.
- Deploy Preview validado.
- Promote solo con orden explícita.

---

## Documentos relacionados

- `docs/AI_DEVELOPER_RULES.md`
- `docs/CHANGE_IMPLEMENTATION_PROTOCOL.md`
- `docs/skills/ui-ux.md`
- `docs/benchmarking-module-preview.md`
- `docs/planning-module-preview.md`
