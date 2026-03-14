# Mapa Técnico del Sistema

Este documento describe cómo está construido el sistema.

## Arquitectura General

El esquema completo de base de datos está documentado en:

**[DB_SCHEMA_MAP.md](./DB_SCHEMA_MAP.md)**

```
Cliente
  ↓
React + Vite
  ↓
API
  ↓
Supabase (PostgREST)
  ↓
Base de datos
  ↓
PostgreSQL
  ↓
Infraestructura
  ↓
Vercel
```

## Módulos del sistema

### Autenticación

**Tecnología:**
- Supabase Auth

**Funciones:**
- login
- logout
- magic link
- recuperación de contraseña

### Organizaciones

**Tablas:**
- organizations
- memberships
- personal

**Permiten:**
- multi tenant
- roles de usuario
- gestión de equipos

### Geocercas

**Permiten:**
- definir zonas geográficas
- asociar personal
- controlar presencia

**Tecnología:**
- Leaflet
- Leaflet-Geoman

### Tracker GPS

**Permite:**
- registrar posiciones GPS
- visualizar personal en mapa
- análisis de movimiento

**Tabla principal:**
- tracker_positions

### Dashboard

Panel central del sistema.

**Incluye:**
- mapas
- filtros
- reportes
- control de actividad

### Billing

Módulo SaaS para monetización.

**Tecnología:**
- Stripe

### Mobile App

Aplicación Android para:
- enviar posición GPS
- registrar actividad