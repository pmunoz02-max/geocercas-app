# Codec 8 Extended — piloto simulado Preview

Implementado receptor TCP local y decodificador 0x8E. Referencia: https://wiki.teltonika-gps.com/view/Codec (consultada 2026-09-30), vector oficial con CRC 0x2994. No habilita hardware físico ni modifica esquema, roles, Android o Producción.

## Contrato y límites

lib/hardware/codec8e.mjs valida preámbulo, longitud (máximo1280bytes), CRC16/IBM, contadores de registros, límites de coordenadas, prioridad e IO de 1/2/4/8 bytes y longitud variable. Conserva IO como hexadecimal para evitar pérdida de precisión. Satellites=0 produce fix_valid=false; no reutiliza coordenadas antiguas como fix nuevo. Altitud, velocidad, rumbo e IO se decodifican pero no se almacenan todavía: la RPC admite solo posición/fecha/fix.

event_id es SHA256 del registro binario, independiente de su paquete y conexión. La clave de base de datos incluye device_id. Dos registros binariamente idénticos se consideran el mismo evento; cambios de orden IO producirían otra identidad y deben evaluarse con firmware real.

lib/hardware/codec8e-server.mjs procesa conexiones secuencialmente, soporta fragmentación y paquetes concatenados. Identificación IMEI de 15 dígitos contra un Map backend; nunca obtiene org o UUID desde el paquete. ACK de registros solo tras stored/duplicate de todos ellos. Fallo parcial cierra conexión sin ACK: retransmitir lote completo recupera mediante idempotencia persistente. Decodifica todo el paquete antes de escribir. Máximo8 conexiones, buffer5120bytes y timeout30s. El helper de escucha se limita a127.0.0.1; no publicar este servidor directamente. IMEI no es autenticación criptográfica.

## Ejecución

- Pruebas locales: node --test --test-timeout=5000 lib/hardware/codec8e.test.mjs
- Ensayo completo: node scripts/run-codec8e-preview.mjs

El ensayo carga credenciales backend desde .env.preview.check, valida proyecto y org ficticia, inicia puerto efímero loopback y transmite una posición sintética cercana a0,0 dos veces en conexiones distintas. Exige ACK binario y stored/duplicate; cierra servidor al terminar. Deja una observación sintética sujeta a retención normal. No imprime credenciales ni paquetes.

La identidad simulada000000000000001 se vincula exclusivamente al primer dispositivo ficticio del inventario. No representa ni suplanta un FMC920 real. La RPC conserva simulation_only y normalized-simulator-v1.

## Validación y siguientes pasos

Seis pruebas locales aprobadas: vector oficial, coordenadas negativas/identidad, truncamiento/CRC/codec/tamaño, contador incorrecto, fragmentación/reconexión/duplicados/ACK posterior al guardado, identidad desconocida/fallo de persistencia.

Pendiente antes de hardware: servicio TCP permanente con supervisión, controles de acceso/red y TLS compatible con firmware, inventario físico y migración revisada (sin debilitar simulación), telemetría/alertas, pruebas de IO variable y límites adicionales, carga y fallos parciales, validación de SIM/APN/firmware. No hay certificación física ni eventos ENTER/EXIT implementados en este piloto. Vercel web no aloja este proceso TCP persistente.

La prueba HTTP normalizada anterior terminó con24h+1.229s,2880 observaciones únicas,23 reenvíos y6 cortes recuperados; no sustituye las pruebas Codec8E.

## Resultado real — 2026-09-30
Ocho pruebas locales aprobadas, incluyendo IO variable, identidad independiente de agrupacion y recuperacion de lote parcialmente guardado. Ensayo TCP real por loopback contra Supabase Preview aprobado: stored seguido de duplicate, ambos con ACK correcto. Quedo una posicion sintetica en el primer dispositivo del piloto. No se habilito receptor publico. Los puntos de pruebas adicionales citados arriba quedan pendientes solo donde no esten cubiertos por estas ocho pruebas.
