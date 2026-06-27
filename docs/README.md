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


## Webhooks y suscripciones — diseño TEST (2026-06-26)

Se documentó la arquitectura futura para webhooks Dodo TEST y suscripciones internas.

Documentos:

- [DODO_WEBHOOKS_TEST_ARCHITECTURE.md](./DODO_WEBHOOKS_TEST_ARCHITECTURE.md)
- [WEBHOOKS.md](./WEBHOOKS.md)
- [BILLING_WEBHOOKS.md](./BILLING_WEBHOOKS.md)
- [SUBSCRIPTIONS_ARCHITECTURE.md](./SUBSCRIPTIONS_ARCHITECTURE.md)

Estado: diseño solamente. Se recuperó acceso técnico por CLI a los proyectos existentes; el dashboard web sigue pendiente. No se implementa SQL, Edge Functions, webhooks reales ni checkout LIVE hasta completar auditoría read-only y recibir orden explícita.

## Migración Billing Preview (Paddle)

- Preview usa Paddle para billing y upgrade PRO
- Producción sigue en Stripe legacy
- Ver [PADDLE_PREVIEW_MIGRATION.md](./PADDLE_PREVIEW_MIGRATION.md) para detalles, arquitectura y troubleshooting

## Página pública de recursos

- Las rutas públicas `/resources`, `/recursos` y `/ressources` apuntan a la página `ResourcesPage.jsx`.
- Los archivos estáticos reales para esta página viven en `public/resources/`.
- Si un PDF, PPTX o video todavía no existe, la interfaz debe mostrar `Próximamente` en lugar de usar enlaces placeholder.


## Recuperación Supabase — estado 2026-06-26

Documento canónico: `SUPABASE_ACCESS_RECOVERY.md`.

Mapa operativo actual:

```txt
Preview Supabase    -> mujwsfhkocsuuahlrssn
Producción Supabase -> wpaixkvokdkudymgjoua
```

La CLI tiene acceso a ambos proyectos, pero el dashboard web sigue devolviendo “no access”. No ejecutar comandos de modificación, deploy de funciones, reparación de migraciones ni cambios de secrets hasta nueva orden.
