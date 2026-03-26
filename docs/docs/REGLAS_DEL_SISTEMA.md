# Reglas del Sistema

Estas reglas son obligatorias para el desarrollo de App Geocercas.

## Reglas de Git

- Solo trabajar en branch `preview`
- No hacer push directo a `main`
- Todo cambio debe probarse primero en preview
- Producción solo se actualiza con "Promote to Production"

## Separación de ambientes

Nunca mezclar:

- Preview
- Producción

Producción usa:

- https://app.tugeocercas.com

Preview usa:

- Vercel preview deployments

## Reglas de Base de Datos

- Toda tabla debe respetar multi-tenant
- Siempre considerar `org_id`
- Nunca eliminar datos sin backup
- Cambios estructurales deben ser migraciones

## Seguridad

Nunca exponer:

- service_role keys
- Supabase secrets
- API keys privadas

## Reglas de código

Evitar:

- soluciones temporales
- hacks locales
- duplicar lógica entre módulos

Siempre buscar:

- soluciones universales
- consistencia
- reutilización

## Regla clave del proyecto

**NO DAÑAR módulos existentes que ya funcionan.**