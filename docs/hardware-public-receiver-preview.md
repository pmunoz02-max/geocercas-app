# Receptor permanente Codec 8E — preparación VPS Linux

Estado: paquete de despliegue preparado; NO desplegado ni dirección pública asignada. Usuario no dispone de VPS. No se ha contratado infraestructura ni modificado Producción. El dispositivo físico todavía no está registrado.

## Alcance real

El servicio Node24 escucha TCP sobre TLS en5027, exige certificado cliente de una CA confiable y vincula su huella SHA256 al identificador permitido. IMEI solo no autentica. La configuración actual se limita al proyecto Preview y a los dos dispositivos ficticios existentes. Se rechaza mode=physical y cualquier IMEI real: esta entrega permite preparar/probar el servidor permanentemente con simulador, NO conectar todavía el FMC920 comprado. No relajar la protección simulation_only ni hacer pasar un equipo real por simulador.

Falta confirmar que el firmware exacto del FMC920 admite certificado cliente y carga segura de claves. Si no lo admite, diseñar acceso por APN privado/VPN autenticada; no desactivar validación TLS para salir del paso. TLS en la ficha comercial por sí solo no demuestra autenticación mutua. Fuente: https://wiki.teltonika-gps.com/view/TRACKER%E2%80%99S_SECURITY y https://teltonika-gps.com/products/trackers/fmc920.

## Archivos

- scripts/hardware-gateway-preview.mjs: proceso permanente, claves solo desde archivos montados, destino Preview fijo, apagado acotado y métricas sin IMEI/coordenadas/claves.
- lib/hardware/gateway-config.mjs: valida modo, inventario ficticio y huellas sin duplicados.
- deploy/hardware-preview/Dockerfile y compose.yaml: usuario node, filesystem de solo lectura, sin capabilities, límites CPU/RAM/PID, logs rotados y restart unless-stopped.
- codec8e-server: máximo8 sockets, buffers acotados, deadline10s para identificación y120s para siguiente paquete completo; timeout de inactividad30s. ACK solo después de commit. Retransmisión idempotente si muere el proceso o falla Supabase; depende de conservación/reenvío en dispositivo. No existe cola durable adicional en gateway.

## Preparación del VPS (pendiente contratación)

VPS Linux con Docker Engine/Compose, IP pública estable, DNS de un subdominio dedicado a Preview y salida HTTPS a Supabase. El puerto5027 es una elección local configurable en el dispositivo, no el puerto de Vercel. No cambiar DNS de app ni Production. Habilitar Docker al arranque. Firewall del proveedor: solo5027/TCP para ingreso, SSH restringido a administración. Docker puede publicar puertos al margen de UFW: verificar firewall del proveedor/DOCKER-USER. No publicar8080.

Instalar bajo /etc/geofield-hardware-preview, fuera del repositorio, los archivos indicados en compose.yaml: config.json, supabase-key, server.key, server.crt, client-ca.crt. Directorio root restringido; archivos sensibles legibles exclusivamente por root y UID1000 del contenedor (por ejemplo propietario1000, modo0400, directorio0700 root). Validar permisos efectivos de bind mounts. Nunca incluir secretos en imagen, git o variables VITE.

Formato de config.json (sustituir huella por certificado del simulador, no por IMEI físico):
```json
{"projectUrl":"https://mujwsfhkocsuuahlrssn.supabase.co","mode":"simulation","devices":[{"imei":"000000000000001","deviceId":"fe0bb5fb-d262-458e-8305-2c15b46c4920","fingerprint256":"HUELLA_SHA256_DE_32_BYTES_SEPARADOS_POR_DOS_PUNTOS"}]}
```

Desde checkout preview revisado:
```
docker compose -f deploy/hardware-preview/compose.yaml config --quiet
docker compose -f deploy/hardware-preview/compose.yaml up -d --build
docker compose -f deploy/hardware-preview/compose.yaml ps
docker compose -f deploy/hardware-preview/compose.yaml logs --tail=30 gateway
```

La imagen base es node:24-bookworm-slim; resolver y fijar digest en el host antes de certificar lanzamiento. No se ha validado build de contenedor localmente porque Docker Engine no está iniciado. No confundir validación de Compose con despliegue.

## Operación y aceptación remota

Health local8080 indica únicamente proceso/listener, NO salud de Supabase ni frescura del GPS. Métricas packet_committed/packet_failed/tls_rejected cada60s. Configurar monitor externo y alertas de fallos de escritura, expiración de certificados y ausencia de posición según frecuencia. Docker healthcheck no reinicia un proceso solo por unhealthy; restart cubre salida/crash. Ante proceso colgado intervenir/monitor externo. No se han contratado ni activado alertas.

Certificados se leen al arrancar. Renovar de forma atómica, reiniciar controladamente, verificar handshake/ACK y rollback a certificado previo si falla. Revocar cliente quitando su huella y reiniciando (cierra conexiones activas). SIGTERM deja20s antes de terminar; lote incompleto no recibe ACK y se reenvía. Rollback: volver al commit/imagen anterior, recrear servicio; no borrar observaciones. Para detener: docker compose down, sin borrar inventario.

Antes de declarar servicio disponible: DNS/TLS desde segunda red, rechazo sin certificado y con identidad incorrecta, stored/duplicate tras reinicio del contenedor, pérdida de conectividad a Supabase, recuperación offline, logs sin secretos y reboot completo del VPS. Después: migración independiente para inventario/recepción física, inspección previa de esquema real, registro IMEI autorizado, firmware/SIM/APN y prueba del FMC920. No hay comandos de inmovilización.

Referencias: https://docs.docker.com/reference/compose-file/services/ ; https://docs.docker.com/compose/how-tos/use-secrets/ ; https://nodejs.org/api/tls.html.

## Verificacion local ejecutada
11 pruebas Node aprobadas: ocho del protocolo, dos de configuracion y una integracion TLS real con certificados efimeros (conexion autorizada y rechazo sin certificado). Sin VPS ni validacion remota; Docker Engine no disponible localmente.
Validacion docker compose config --quiet aprobada. No se ejecuto docker build ni despliegue.
