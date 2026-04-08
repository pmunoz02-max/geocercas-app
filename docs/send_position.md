# send_position – Fix user_id UUID

## Problema
El endpoint send_position fallaba con error:
"column user_id is of type uuid but expression is of type text"

## Causa
El user_id se estaba resolviendo como string (text) antes del insert en positions.

## Solución
Se asegura que user_id sea UUID real antes del insert.

Ejemplo:
- Cast explícito a uuid
- Validación de valor no nulo

## Impacto
- Se corrige error 500 en inserción de posiciones
- Se restablece tracking en Android
- Se mantiene integridad de datos en positions.user_id

## Notas
Este cambio afecta directamente la arquitectura de tracking y tipado en backend.