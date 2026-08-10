# Single owned organization limit

Fecha: 2026-08-09  
Proyecto: GeoField GPS / App Geocercas  
Branch de trabajo: `preview`

## Regla de negocio

Un usuario/email puede pertenecer a varias organizaciones mediante membresías o invitaciones.

Sin embargo, un usuario normal solo puede crear una organización propia por defecto.

## Motivo

Evitar que usuarios creen múltiples organizaciones FREE para evadir límites comerciales de geocercas, trackers o módulos.

## Alcance

Permitido:

- Un usuario puede pertenecer a varias organizaciones.
- Un usuario puede ser tracker en una organización y owner/admin en otra.
- Las invitaciones siguen funcionando.
- Cada organización conserva su propio `org_billing`.

Bloqueado:

- Crear múltiples organizaciones propias desde el mismo usuario autenticado.

## Implementación Preview

Se agregó protección en base de datos sobre `public.organizations`:

- Función: `public.enforce_single_owned_organization`
- Trigger: `trg_enforce_single_owned_organization`

El trigger bloquea inserciones cuando `auth.uid()` intenta crear una nueva organización con `owner_id = auth.uid()` y ya existe otra organización propia para ese usuario.

Error backend:

```txt
organization_creation_limit_reached
```

## Producción

Aplicado y validado en Producción.

Se creó la función:

```txt
public.enforce_single_owned_organization
```

y el trigger:

```txt
trg_enforce_single_owned_organization
```

sobre:

```txt
public.organizations
```