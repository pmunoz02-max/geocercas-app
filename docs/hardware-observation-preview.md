# Recepción hardware: simulador local Preview

Estado: contrato inicial y simulador local. No hay endpoint, migración de posiciones ni persistencia remota en esta entrega.

## Archivos
- lib/hardware/observation.mjs: validación pura del formato v1 y orden temporal.
- scripts/simulate-hardware-preview.mjs: ocho envíos ficticios, sin red, claves ni datos del piloto.
- src/test/hardware-observation.test.js: coordenadas, identidad, fechas, política y orden.

## Contrato
El paquete admite únicamente version=1, event_id (1..96 caracteres ASCII alfanuméricos, guion o guion bajo), recorded_at UTC canónico con milisegundos, fix_valid booleano y latitude/longitude numéricas cuando hay fix. Sin fix solo se admiten coordenadas ausentes o nulas. No se inventa precisión.

No se admiten org_id, tracker_id, device_id ni received_at en el paquete: el futuro receptor debe obtener la identidad del canal autenticado y emitir la hora de recepción en el servidor. Este validador NO autentica dispositivos.

Se rechazan puntos más de dos minutos en el futuro o que hayan alcanzado la retención configurada. La política se entrega desde el backend, nunca desde el paquete. El orden es recorded_at y event_id ASCII como desempate estable; un reenvío no actualiza la antigüedad.

## Simulación
Ejecutar: node scripts/simulate-hardware-preview.mjs
Pruebas: npx vitest run src/test/hardware-observation.test.js --pool=forks --reporter=verbose --no-color

El historial del simulador es un Map efímero para un único origen ficticio. Esperado: 4 observaciones, 1 duplicado, 1 conflicto de idempotencia y 2 rechazos; última posición run1-003 pese a recibir después run1-002. La observación sin fix no sustituye la última posición. No hay garantías de durabilidad, concurrencia ni retención por ejecutar este simulador.

## Siguiente integración
Antes de preparar SQL, inspeccionar nuevamente metadatos de las tablas instaladas. Implementar persistencia transaccional con clave única (device_id,event_id), comparación del contenido en reintentos, identidad resuelta por backend, vínculo vigente al instante del evento y bloqueo compatible con el inventario. Los eventos anteriores al primer vínculo se rechazan; no reasignar historia al reemplazar dispositivo.

La última posición debe avanzar solo con fix válido y orden posterior; la comunicación sin fix tiene estado separado. Reintentos concurrentes requieren pruebas con dos conexiones. La purga debe eliminar historial, estado y claves idempotentes vencidas de forma consistente, sin permitir reingreso de eventos expirados. inside_only requiere evaluación de geocercas y no se debe aceptar silenciosamente como full_route.

No conectar ingreso real antes de implementar y probar autenticación, persistencia, purga y aislamiento. No se cambiaron Android, endpoints móviles ni Producción. Sin push ni deploy.

## Resultado ejecutado
23/23 pruebas correctas (1 archivo). Simulador ejecutado con salida coincidente: 4 observaciones, duplicado y conflicto detectados, dos rechazos y última posición run1-003. persisted=false. Fecha: 2026-09-27.

## Avance de recepción transaccional
Preparada y validada en local y Preview con ROLLBACK. Ver hardware-ingestion-preview.md. Cliente backend disponible, sin habilitar HTTP remoto ni purga recurrente.
