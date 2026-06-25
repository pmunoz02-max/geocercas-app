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
| DB_SCHEMA_MAP | mapa tecnico completo de tablas, vistas, RPC y relaciones de BD |
| DB_OVERVIEW | tablas y relaciones |
| FLUJOS_CLAVE | flujos funcionales del sistema |
| KNOWN_ISSUES | problemas conocidos |

**Esta documentación debe mantenerse actualizada en cada cambio importante.**


## Dodo Payments aprobado (2026-06-25)

Dodo Payments aprobó la cuenta de FENICE ECUADOR S.A.S. para live payments y payouts.

Productos TEST creados y validados visualmente:

- Geocercas GPS PRO — USD 29/month
- Geocercas GPS Enterprise — USD 99/month

La integración aún no debe tocar producción, webhooks live, API keys ni Android. La arquitectura debe mantenerse proveedor-agnóstica: la base de datos interna sigue siendo la fuente de verdad del plan y Dodo actúa solo como proveedor externo de checkout/cobro/eventos.

Ver [dodo-payments-approval.md](./dodo-payments-approval.md).

## Migración Billing Preview (Paddle)

- Preview usa Paddle para billing y upgrade PRO
- Producción sigue en Stripe legacy
- Ver [PADDLE_PREVIEW_MIGRATION.md](./PADDLE_PREVIEW_MIGRATION.md) para detalles, arquitectura y troubleshooting

## Página pública de recursos

- Las rutas públicas `/resources`, `/recursos` y `/ressources` apuntan a la página `ResourcesPage.jsx`.
- Los archivos estáticos reales para esta página viven en `public/resources/`.
- Si un PDF, PPTX o video todavía no existe, la interfaz debe mostrar `Próximamente` en lugar de usar enlaces placeholder.

## Integración checkout Dodo Preview (2026-06-25)

Se agregó integración inicial de checkout externo proveedor-agnóstica para Preview/Test Mode. Ver [DODO_CHECKOUT_PREVIEW_INTEGRATION.md](./DODO_CHECKOUT_PREVIEW_INTEGRATION.md).

