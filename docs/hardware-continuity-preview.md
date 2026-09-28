# Continuidad y estados del piloto — Preview

Frecuencia esperada del simulador: 60 segundos. Tolerancia: tres intervalos (180 segundos). Esta política pertenece al piloto y no redefine los umbrales Android ni certifica equipos físicos.

Estados:
- En línea: observación nueva recibida y posición válida reciente.
- Sin comunicación: más de 180 segundos desde received_at del último envío nuevo.
- Sin señal GPS: comunicación reciente con fix_valid=false.
- Posición atrasada: comunicación reciente pero recorded_at tiene más de 180 segundos.
- Sin datos / Estado no disponible: sin observaciones visibles o relojes inválidos.

Reenvíos idénticos no renuevan received_at. Las retransmisiones repetidas no se interpretan como comunicación nueva en este contrato. La última comunicación se consulta por received_at, independientemente de la ventana del recorrido y del máximo de 500 puntos. RLS y retención siguen aplicándose. La pantalla consulta cada 30 segundos y cancela peticiones al cambiar de tracker u organización; un error se muestra como error, no como offline.

Implementación: src/lib/hardwarePreview.js, src/pages/HardwarePilotPage.jsx. Pruebas: src/test/hardware-health.test.js y pruebas de página/ruta existentes. Nueve pruebas correctas; build Vite correcto.

Prueba real acotada: scripts/test-hardware-continuity-preview.mjs usa exclusivamente dispositivos del inventario ficticio, destino Preview exacto y credencial backend por variables de entorno. Envía fix válido, no-fix, espera 185 segundos sin envío, repite el mismo paquete, comprueba desconexión, envía un punto atrasado y recupera con un punto actual. Se conservan las cuatro observaciones nuevas bajo la retención del piloto. No programa una simulación indefinida ni usa personas reales.

Esta prueba verifica una interrupción breve real, no una prueba de resistencia de horas/días. No demuestra reinicio de un dispositivo físico, pérdida de conectividad TCP ni continuidad Android. No se cambian bases de Producción ni se hace Promote.

Purga verificada en Preview: tarea activa cada 15 minutos, última ejecución consultada succeeded y cero observaciones vencidas pendientes. No se aceleró el reloj de la base ni se alteró la retención.

Resultado real: prueba HTTP completada con PASS online → no_fix → pausa 185 s → offline → delayed → online. Reenvío idéntico mantuvo received_at. Evidencia: hardware-continuity-preview-validation.json. Los estados se publican solo en la página del piloto Preview.
