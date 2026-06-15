# Benchmarking — Adaptive chart scale

## Status

Implemented in Preview and promoted to Production after validation.

## Scope

This document records the visual behavior added to `/benchmarking` after the initial production rollout.

## Problem solved

The first line chart implementation summarized the time evolution by period. This made the chart useful for a global trend, but it hid individual groups when the user was comparing geofences, people, activities or assignments.

A second issue appeared when efficiency indicators were very small, which is normal because the base unit is `m²`. With a Y axis forced from zero, several valid values appeared visually flat or indistinguishable.

## Current behavior

### Bars

Bar charts compare all visible groups using the selected indicator.

### Lines

Line charts preserve all visible groups as separate series. The chart must not collapse groups into a single average line unless a future UI explicitly offers an "average only" option.

### Adaptive Y scale

When values are very small or spread across several orders of magnitude, the chart may use an adaptive Y scale.

This improves readability for values such as:

```text
0.000000002
0.000000045
0.000000509
0.000015703
0.000646907
```

## Non-goals

The adaptive scale does not change:

- SQL views
- `v_benchmarking_efficiency_preview`
- RLS
- organization scoping
- KPI calculations
- table values
- CSV exports
- billing, tracking or geofencing logic

## Source of truth

The numeric source of truth remains:

```sql
public.v_benchmarking_efficiency_preview
```

The table and CSV remain the authoritative visible outputs for exact values.

## Implementation file

```text
src/pages/Benchmarking.jsx
```

## Operational rule

Any future chart change must be validated in Preview before Promote to Production and must not be mixed with database, auth, RLS, tracking, billing or geofencing changes.
