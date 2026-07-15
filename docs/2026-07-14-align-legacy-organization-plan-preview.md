# Alineación de organizations.plan con org_billing — Preview

Fecha: 2026-07-14

Entorno: Supabase Preview únicamente.

## Objetivo

Alinear la columna legacy `public.organizations.plan` con la fuente comercial real `public.org_billing.plan_code`.

## Fuente de verdad

La fuente oficial del plan de una organización es:

```text
public.org_billing.plan_code
