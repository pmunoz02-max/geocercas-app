# DODO Change Plan Function Preview Validation

Fecha: 28 junio 2026  
Branch: preview  
Ambiente: Supabase Preview  
Proyecto Supabase Preview: mujwsfhkocsuuahlrssn / pruebatugeo

## 1. Objetivo

Modificar el flujo de upgrade de PRO a Enterprise para evitar doble suscripción en Dodo.

Antes de este cambio, una organización con PRO activo que solicitaba Enterprise abría un nuevo checkout Enterprise. Ese flujo funcionó para validar Dodo TEST en Preview, pero no es el flujo recomendado para Producción porque puede crear dos suscripciones activas.

## 2. Cambio aplicado

Se actualizó la Edge Function:

```text
supabase/functions/dodo-create-checkout/index.ts