# Flujos Clave del Sistema

> Database tables referenced in these flows are documented in
> **[DB_SCHEMA_MAP.md](./DB_SCHEMA_MAP.md)**

## Registro de usuario

```
Usuario crea cuenta
  ↓
Supabase Auth crea usuario
  ↓
Se crea organización inicial
  ↓
Se asigna rol owner
```

## Invitación de usuario

```
Admin invita usuario
  ↓
Se envía magic link
  ↓
Usuario acepta
  ↓
Se crea membership
```

## Registro de posición GPS

```
App móvil envía posición
  ↓
API recibe posición
  ↓
Se guarda en tracker_positions
  ↓
Dashboard actualiza mapa
```

## Creación de geocerca

```
Usuario abre mapa
  ↓
Dibuja polígono
  ↓
Se guarda en geofences
```

## Visualización de tracker

```
Dashboard consulta:
  - tracker_positions
  ↓
Muestra posiciones en mapa
```