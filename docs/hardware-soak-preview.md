# Prueba de resistencia hardware de 24 horas — Preview

Iniciada el 28/09/2026 a las 14:44:18 (Ecuador); fin previsto el 29/09/2026 a las 14:44:18. Estado inicial comprobado: running, 2 posiciones guardadas y verificadas, cero errores y cola vacía. El resultado final todavía NO existe.

Ejecutor: scripts/run-hardware-soak-preview.mjs. Solo Supabase Preview mujwsfhkocsuuahlrssn, usando los dos dispositivos ficticios registrados. Un envío por dispositivo cada minuto, 1440 intervalos, 2880 posiciones previstas. Coordenadas ficticias próximas a 0,0; sin personas ni equipos reales.

Cada cuatro horas, minutos 30 a 34: se generan observaciones pero se retienen en cola local cinco minutos. En recuperación se envía primero la más reciente; se verifica después de cada inserción que la última posición no retrocede. Cada hora se reenvía un paquete idéntico y se comprueba que no cambie received_at. Reconciliación horaria y final del conjunto completo de IDs, recorded_at y received_at mediante HTTP, con paginación. Un error o hueco impide marcar passed.

La cola y el progreso se escriben antes de enviar, con reemplazo atómico del estado. Un reinicio puede usar el mismo directorio, antes de endsAt, sin duplicar paquetes; no se rellena un hueco de ejecución como si hubiera sido continuidad real. Archivo de bloqueo impide dos procesos activos. Claves se leen en memoria desde .env.preview.check, nunca se guardan en el informe ni se pasan como argumento.

Directorio del ensayo: C:\Users\pmuno\.codex\.chatgpt-projects\g-p-68e7b55c8424819192a593e1d05730d8\hardware-soak-20260928 . Progreso: state.json; logs: stdout.log / stderr.log. Inicio: PID 20492, proceso Node oculto. El proceso termina automáticamente después de 24 horas y la reconciliación final. No se ejecuta indefinidamente.

Se creó una revisión automática horaria en esta conversación: verificar-prueba-gps-de-24-horas-en-preview. Consulta avance y purga del piloto, guarda evidencia y solo notifica fallos, intervención necesaria o resultado final. Debe desactivarse después del resultado final. El PC y Codex deben permanecer disponibles; suspensión, apagado o pérdida de conexión pueden impedir el ejecutor o la revisión. No se alteraron opciones de energía del usuario.

La prueba no equivale a 24 horas de un GPS físico ni valida aún TCP, reinicio de hardware o la retención completa de 30 días. La purga programada se observa durante el ensayo; borrado de vencidos ya probado localmente. Al terminar se conservan solo datos simulados bajo la política normal de retención. No se modificó Producción ni Android.
