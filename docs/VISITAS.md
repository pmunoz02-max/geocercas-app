# Visitas opcionales — Preview

## Uso
El propietario o administrador abre /visitas y activa el módulo para su organización.
Está desactivado por defecto y no activa registro automático. Cada persona inicia y
finaliza voluntariamente una visita. Desactivarlo impide nuevas visitas, mantiene el
historial y permite finalizar visitas previamente guardadas. El tracker GPS no cambia.

Incluye geocerca, asignación para trackers, motivo, notas, resultado, pendientes,
inicio/fin manual, duración y ubicaciones declaradas por el dispositivo. Historial
limitado a las últimas 200 visitas, filtros por persona/geocerca y fecha (UTC), CSV.
Los administradores ven su organización; los demás únicamente sus propias visitas.

## Foto con ubicación
Una imagen opcional JPG/PNG de hasta 2 MB por visita. Se registra la ubicación,
precisión y hora al adjuntar; NO acredita dónde se tomó una imagen de galería.
Sin GPS se indica ubicación no disponible. No hay verificación automática de
presencia ni validación de EXIF. Las imágenes se guardan en bucket privado
visit-evidence; enlaces firmados duran cinco minutos. Actualizar renueva enlaces.
Se recomienda no fotografiar personas o documentos ajenos al trabajo autorizado.

## Datos y seguridad
Tablas aditivas org_visit_settings y field_visits, RLS habilitado y acceso directo
revocado a anon/authenticated. Solo service_role accede mediante API con usuario
validado por Auth o sesión runtime activa, vigente y no revocada. No se confía en
identidades del cuerpo. RPC save_field_visit vuelve a comprobar membresía y rol.
Advisory lock por organización serializa activación y guardado. UUID del dispositivo
hace idempotentes reintentos; visitas cerradas son inmutables; colisiones entre
organizaciones se rechazan. No se duplican personas ni se modifican asignaciones.

Los borradores se guardan en IndexedDB por origen, organización y usuario, incluyendo
la foto. Se sincronizan con la página abierta al recuperar conexión, cada 30 segundos
o al pulsar Actualizar. No es sincronización con la app cerrada. El contexto se almacena
localmente para recuperar borradores tras recarga sin red; requiere una carga previa
con sesión válida. El servidor sigue rechazando escrituras si se revoca el acceso o
se desactiva el módulo. Borrar datos del navegador elimina borradores no sincronizados.

## Android Preview
Selector de fotos y transporte nativo preparados en geocercas-twa-preview. Aplicar
primero visits-photo-picker-preview.patch y después visits-native-requests-preview.patch.
El transporte solo admite https://preview.tugeocercas.com/api/visits, verifica org y
usuario nativos y no expone el token renovado a JavaScript ni sigue redirects.
La alternativa inicial de exponer tokens fue rechazada por revisión automática y
no se aplicó. Se sustituyó por el transporte limitado anterior.
Android Producción no se modifica. La versión Play actual no contiene este selector:
se requiere instalar y verificar el APK Preview antes de preparar otra versión Play.
Pendiente prueba física de selección de foto, permiso GPS, cancelación y modo avión.
El recordatorio R8 de la siguiente versión Play sigue pendiente; este APK es debug.

## Verificación
12 pruebas Vitest aprobadas: opt-in, rol, foto offline, coordenadas inválidas,
credenciales runtime expiradas/revocadas y aislamiento de organización, CSV.
Pruebas SQL transactional.sql en Supabase Preview con ROLLBACK: módulo apagado,
activación, duplicados, miembro ajeno, cierre después de apagar, inmutabilidad y grants.
Advisors señala RLS sin políticas en las dos nuevas tablas: intencional, backend-only.
Compilación web y Android Preview comprobadas. No acredita prueba física ni producción.

## Despliegue
Migraciones optional_visits_module y harden_visit_id_conflicts aplicadas exclusivamente
a Preview mujwsfhkocsuuahlrssn. Ninguna organización queda activada por la migración.
Antes de Promote se deben aplicar y verificar migraciones en Producción con autorización
y preparar el transporte nativo para el host de Producción en una nueva entrega Android.
No promover solo el frontend y dar por completo el despliegue.

## Corrección del despliegue (25 septiembre 2026)
Vercel rechazó b888610 por superar las 12 funciones del plan Hobby (13).
La URL /api/visits se conserva mediante una ruta explícita anterior a /api/*;
api/auth/index.js carga server/visits/index.js, que mantiene su propia autenticación.
El punto de entrada compartido admite cuerpos de hasta 3 MB para la foto.
El código de Visitas vive fuera de api/ y el despliegue vuelve a 12 funciones.
No cambia la base de datos ni requiere modificar Android.
Validación de la corrección: 16 pruebas aprobadas, incluidas ruta de Visitas, delegación de credenciales/cuerpo, sesión existente y rechazo de rutas desconocidas.

## Selector visible desde el inicio
La foto opcional puede elegirse antes de iniciar la visita y durante su registro.
El formulario explica que admite imágenes del sitio, presentes o documentos y muestra
una vista previa. La imagen inicial se incorpora al borrador al pulsar Iniciar visita.
Se mantienen JPG/PNG, 2 MB, almacenamiento privado y ubicación al adjuntar.

## Instalacion en Produccion tras Promote (25 septiembre 2026)
El Promote de la web no transporto la estructura Supabase. Se confirmo que faltaban
org_visit_settings, field_visits, save_field_visit y el bucket visit-evidence en
wpaixkvokdkudymgjoua. Bajo la solicitud de corregir Produccion se aplicaron las dos
migraciones existentes optional_visits_module y harden_visit_id_conflicts.
Las pruebas transactional.sql pasaron con ROLLBACK; comprobacion posterior:
0 visitas y 0 ajustes persistidos, bucket privado, RPC denegada a anon/authenticated
y permitida a service_role. Advisors solo informa RLS sin politicas para estas tablas,
intencional al ser acceso exclusivamente desde backend.
La ruta publica /api/visits responde 401 authentication_required sin credenciales.
No se activaron organizaciones automaticamente ni se modificaron roles o tracking.
Esta verificacion cubre estructura, RPC y ruta HTTP; no acredita una carga real de
foto desde una sesion de usuario ni el selector de la app Android de Produccion.
La nueva version Android con selector y transporte nativo sigue pendiente.
