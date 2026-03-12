# App Geocercas – Documentación Técnica

Esta carpeta contiene la documentación técnica y operativa del sistema.

El objetivo es:

- mantener coherencia en el desarrollo
- documentar arquitectura y reglas
- facilitar debugging
- acelerar nuevas implementaciones
- evitar romper funcionalidades existentes

## Stack principal

### Frontend

- React
- Vite
- Leaflet
- Tailwind

### Backend

- Supabase
- PostgreSQL
- RLS policies
- Edge Functions

### Infraestructura

- Vercel
- Supabase Cloud

### Mobile

- Android (Google Play)

## Componentes principales del sistema

- Autenticación
- Organizaciones (multi-tenant)
- Personal
- Geocercas
- Tracker GPS
- Asignaciones
- Dashboard
- Billing SaaS

## Documentos clave

| Documento | Contenido |
|-----------|----------|
| REGLAS_DEL_SISTEMA | reglas obligatorias de desarrollo |
| MAPA_TECNICO | arquitectura completa |
| DB_OVERVIEW | tablas y relaciones |
| FLUJOS_CLAVE | flujos funcionales del sistema |
| KNOWN_ISSUES | problemas conocidos |

**Esta documentación debe mantenerse actualizada en cada cambio importante.**