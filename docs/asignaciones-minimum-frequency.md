# Frecuencia mínima en Asignaciones

La frecuencia mínima al crear o editar una asignación es de 5 minutos.
El formulario aplica min=5 y valida el valor antes de enviar. El endpoint
rechaza con HTTP 400 invalid_frequency cualquier frecuencia proporcionada
inferior a 5 minutos o 300 segundos, así como valores no numéricos o nulos.
Ambos campos se validan cuando se proporcionan juntos.

No se modifican registros existentes ni el esquema. Un PATCH que omite ambos
campos conserva su frecuencia actual. Los mensajes están traducidos a ES, EN y FR.

Prueba: src/test/asignaciones-frequency.test.js cubre POST y PATCH, ambos campos,
el límite exacto, valores inferiores e inválidos y la omisión de frecuencia.

Verificación: 38 pruebas aprobadas y compilación Vite correcta.
