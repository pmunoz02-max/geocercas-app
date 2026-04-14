# Tracker Latest Upsert Fix

## Problema

`api/send-position.js` fallaba con `tracker_latest_upsert_failed`.

## Causa

La tabla `tracker_latest` requiere campos obligatorios:

- `event`
- `geom`

El endpoint no los estaba enviando.

## Solución

Se actualizó `send-position.js` para enviar:

- `event = POSITION`
- `geom = SRID=4326;POINT(lng lat)`

Además se mantuvo el flujo de:

- runtime session validation
- assignment validation
- positions insert
- tracker_health upsert