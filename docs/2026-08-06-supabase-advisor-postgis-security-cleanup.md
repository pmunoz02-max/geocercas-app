# Supabase Advisor security cleanup — PostGIS relocation and security_invoker views

Fecha: 2026-08-06  
Proyecto: GeoField GPS / App Geocercas  
Branch de trabajo: `preview`

## Resumen

Se atendieron los avisos críticos de Supabase Security Advisor en los ambientes Preview y Producción.

Resultado final:

- Preview / `pruebatugeo`: Security Advisor quedó sin issues.
- Producción / `My Project`: Security Advisor quedó sin issues.
- No se hizo push a `main`.
- No se mezclaron cambios entre Preview y Producción.
- Los cambios se validaron primero en Preview y luego en Producción.

## Cambios aplicados

### 1. Vistas propias de la app

Las vistas propias de GeoField GPS que aparecían como `Security Definer View` fueron configuradas con:

```sql
security_invoker = true