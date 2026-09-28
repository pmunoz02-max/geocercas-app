# Vista del piloto hardware en Preview

Implementada localmente en /hardware-piloto, dentro de AuthGuard, TrackerRoleGuard y RequireOrg. Acceso de la cuenta indicada por el usuario configurado en Preview. Pendientes publicación web y revisión visual autenticada.

La página solo carga datos con hostname Preview/localhost/vercel y Supabase Preview exacto. En Producción muestra un mensaje sin consultas hardware. Usa la sesión del navegador y RLS, nunca service_role. Selecciona la organización actual, filtra trackers simulados y consulta las últimas 24 horas, máximo 500 observaciones (501 para detectar truncamiento). Solo fixes válidos van al mapa; tiempos del dispositivo y recepción se muestran separados. No afirma estado online. Cancela solicitudes al cambiar organización o selección y oculta resultados anteriores durante la carga.

Mapa Leaflet con recorrido, última posición, ajuste de extensión y tabla accesible. Datos identificados siempre como simulados. Actualización manual. No se modificó el dashboard ni la sesión Android. Los mosaicos usan OpenStreetMap.

Generador scripts/generate-hardware-route.mjs: 12 puntos ficticios cerca de (0,0) por dispositivo; no son un recorrido real. Escribe batch nuevo sin sobrescribir uno existente. docs/hardware-pilot-route-batch.json conserva los IDs estables del envío para reintentos.

Se enviaron 24 observaciones por HTTP a los dos dispositivos del piloto Preview: 24 stored. Consulta independiente confirmó 12 por tracker. Se conservan bajo la retención de 30 días; la vista de 24 horas dejará de mostrarlas pasado ese plazo de visualización, por lo que futuras pruebas deben generar un lote nuevo.

Validación: 5 pruebas aprobadas (entorno, orden ASCII, coordenadas, renderizado y error); compilación Vite correcta. Advertencias existentes de tamaño de bundle/Browserslist. El mapa Leaflet se sustituyó por un mock en las pruebas: pendiente comprobación visual en navegador con cuenta autorizada.

Acceso concedido a la cuenta Preview indicada por el usuario (detalle de verificación al final). El propietario actual no tiene correo ni credenciales. No usar una clave backend para saltarse RLS ni mostrar el piloto a cualquier usuario. Publicar después de completar el acceso y comprobarlo. Producción intacta.

## Acceso autorizado al piloto

Se añadió a la cuenta indicada por el usuario como admin activo únicamente de SIM GPS/GNSS Preview. No se cambió el propietario ficticio ni la organización predeterminada. Se comprobaron dentro de la transacción las membresías, org_members y app_user_roles de esa cuenta en otras organizaciones: sin cambios. Los bridges existentes sincronizaron el nuevo rol.

Verificación con SET LOCAL ROLE authenticated y auth.uid de la cuenta: admin_verified=true, 2 trackers y 26 observaciones visibles. Es una prueba de RLS en base de datos, no una sesión web autenticada ni una revisión del mapa en navegador. Producción no se consultó ni modificó. La vista /hardware-piloto sigue local, pendiente publicación.
