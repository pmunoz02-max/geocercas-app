# Prevención de doble envío de invitación

La pantalla InvitarTracker bloquea inmediatamente nuevas llamadas mientras hay un envío
pendiente, mediante una referencia sin esperar el siguiente render de React.
Tras éxito recuerda organización y correo normalizado durante la vida de la pantalla:
un nuevo submit para ese destinatario no llama a la API y el botón queda deshabilitado.
Tras error libera el bloqueo y permite reintentar. No altera permisos, cupos ni tracking.

Verificación: InvitarTracker.test.jsx, 11 pruebas aprobadas. La regresión comprueba dos
submits consecutivos, un error simulado, reintento exitoso y un nuevo submit tras éxito.
No se enviaron correos reales.

Alcance: protección del formulario abierto. No es idempotencia distribuida del backend;
una recarga, otra pestaña o un cliente distinto pueden volver a solicitar una invitación.
