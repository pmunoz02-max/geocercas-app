# Problemas Conocidos

Este documento registra errores recurrentes y sus soluciones.

## Problema: tracker_positions no filtra correctamente

**Causa:**
- user_id no sincronizado con personal

**Solución:**
- asegurar:
  - personal.user_id = auth.users.id

## Problema: dashboard muestra datos de otra organización

**Causa:**
- query sin org_id

**Solución:**
- filtrar siempre por org_id