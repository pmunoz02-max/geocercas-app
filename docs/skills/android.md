# Skill: Android (GeoField GPS, TWA + Native Tracking)

## Objetivo

Garantizar que la app Android **GeoField GPS** funcione sin pantallas en blanco, mantenga tracking estable y cumpla requisitos de Google Play.

---

## Arquitectura actual

La app Android oficial es **GeoField GPS**.

Package oficial:

`com.fenice.geofieldgps`

Host de producción:

`app.tugeocercas.com`

No usar ni referenciar packages o nombres antiguos:

- `com.fenice.geocercas`
- `com.tugeocercas.app`
- GeocercasApp
- App Geocercas
- Geocercas GPS
- App Geofences

Para vinculación TWA y verificación de dominio, el archivo `assetlinks.json` debe contener el SHA-256 real de la firma de Google Play App Signing.

---

## Stack Android

La app usa:

```txt
TWA / WebView + Backend Vercel + Supabase + Servicio nativo de ubicación
```

Flujo general:

1. Usuario abre GeoField GPS.
2. La app carga la web oficial.
3. El tracker acepta invitación por `/tracker-accept`.
4. El backend genera runtime token.
5. El tracker entra a `/tracker-gps`.
6. Android envía posiciones al backend.
7. Backend guarda posiciones.
8. Dashboard/reportes reflejan datos.

Regla crítica:

Android no debe depender solo del WebView para tracking. El tracking debe poder funcionar de forma estable, incluso en segundo plano cuando aplique.

---

## Permisos obligatorios

Permisos esperados en Android:

- `INTERNET`
- `ACCESS_NETWORK_STATE`
- `ACCESS_FINE_LOCATION`
- `ACCESS_COARSE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_LOCATION`
- `RECEIVE_BOOT_COMPLETED`

---

## Tracking nativo

El tracking nativo debe usar:

- Foreground Service
- FusedLocationProviderClient
- Runtime token válido
- Envío periódico a backend

Responsabilidades:

- Obtener ubicación periódica.
- Enviar posiciones a `/api/send-position`.
- Manejar reconexión.
- No enviar requests sin token válido.
- Mantener estado de tracking consistente.
- Recuperarse si el servicio se cae, cuando aplique.

---

## Runtime token

Flujo correcto:

1. Invitación tracker se acepta en `/tracker-accept`.
2. Backend valida invitación.
3. Backend genera runtime token.
4. Tracker entra a `/tracker-gps`.
5. Android usa runtime token para enviar posiciones.
6. Backend valida token antes de guardar ubicación.

Reglas:

- No usar magic link como mecanismo de tracking.
- No depender de sesión owner/admin.
- No enviar posiciones usando tokens de otro usuario.
- No mezclar runtime token con sesión web.
- No perder token al cerrar app si el tracking debe seguir activo.
- No enviar GPS sin auth válida.

---

## WebView / TWA

Reglas de UI:

- No dejar pantalla blanca.
- Mostrar loader mientras carga.
- Manejar error de red.
- Implementar retry.
- Timeout si no carga.
- Mostrar mensajes claros si falta permiso, token o conexión.
- No mostrar errores técnicos crudos al usuario final.

Problema conocido:

Pantalla blanca.

Causa típica:

WebView/TWA sin loader o sin error handler.

Solución permanente:

- Loader visible.
- Mensaje de error.
- Botón retry.
- Fallback controlado.

---

## Boot automático

Usar BootReceiver cuando aplique.

Objetivo:

- Reiniciar tracking después de reboot.
- Verificar si hay tokens guardados.
- Relanzar servicio si aplica.
- Evitar pérdida silenciosa de tracking.

---

## Watchdog

Opcional pero recomendado:

`WorkManager` / `TrackingWatchdogWorker`

Función:

- Revisar si el servicio está activo.
- Relanzarlo si se cayó.
- Evitar tracking detenido silenciosamente.

---

## Google Play

Para producción usar siempre:

- Android App Bundle `.aab`
- VersionCode nuevo en cada release.
- VersionName coherente.
- Build firmado correctamente.
- App instalada desde Google Play Internal Testing o track productivo para validar App Links reales.

No usar APK para producción.

---

## Requisitos Play Store

Evitar rechazo por:

- Broken functionality.
- Pantallas blancas.
- Crashes.
- Tracking que no inicia.
- Tracking que dice activo pero no envía posiciones.
- Falta de explicación de ubicación.
- Falta de justificación de ubicación en background.
- Data Safety incompleto.

Debe existir:

- Explicación clara del uso de ubicación.
- Justificación de ubicación en background.
- Política de privacidad pública.
- Términos públicos.
- Data Safety consistente con el comportamiento real.

---

## App Links

Dominio productivo oficial:

`app.tugeocercas.com`

El archivo productivo debe estar en:

`https://app.tugeocercas.com/.well-known/assetlinks.json`

Package oficial:

`com.fenice.geofieldgps`

SHA-256 Google Play App Signing:

`6B:CF:82:23:06:62:28:20:51:11:0E:72:26:1A:21:D5:37:CF:92:EB:F5:74:AE:A5:D2:76:71:6C:A8:FC:55:D2`

Reglas:

- No agregar SHA locales/sideload a `assetlinks.json` productivo.
- No validar App Links productivos con instalaciones sideload (`installer=null`).
- Para validar App Links productivos, la app debe estar instalada desde Google Play Internal Testing o producción.
- El installer esperado para prueba real es `com.android.vending`.

Comando de validación:

```powershell
.\adb.exe shell cmd package list packages -i | findstr geofieldgps
.\adb.exe shell pm verify-app-links --re-verify com.fenice.geofieldgps
.\adb.exe shell pm get-app-links com.fenice.geofieldgps
```

Resultado esperado:

```txt
package:com.fenice.geofieldgps installer=com.android.vending
app.tugeocercas.com: verified
```

---

## Deep links y rutas tracker

Flujo oficial tracker:

`/tracker-accept?inviteToken=...&org_id=...`

Luego:

`/tracker-gps`

Reglas:

- `/tracker-accept` es el flujo oficial para aceptar invitaciones.
- `/tracker-open` queda solo como redirect legacy.
- No usar `/tracker-open` en nuevos emails, deep links o fallback web.
- No depender de `intent://` para el flujo oficial.
- No depender de pantallas tipo “Ya tengo la app”.
- Cualquier email o fallback nuevo debe apuntar a `/tracker-accept`.

---

## Logs

Durante debug:

- Logs de App Links.
- Logs de permisos GPS.
- Logs de inicio/detención de tracking.
- Logs de envío GPS.
- Logs de token/runtime session.
- Logs de errores WebView/TWA.

En producción:

- No mostrar logs técnicos al usuario.
- No exponer tokens.
- No exponer datos sensibles.
- Mostrar mensajes claros y accionables.

---

## Pruebas obligatorias antes de release Android

Checklist:

- App instalada desde Google Play Internal Testing.
- `installer=com.android.vending`.
- `app.tugeocercas.com: verified`.
- App abre correctamente desde ícono.
- Link externo `/tracker-accept` abre en GeoField GPS.
- Login funciona.
- Invitación tracker funciona.
- Runtime token se genera correctamente.
- `/tracker-gps` carga correctamente.
- Tracking inicia.
- Posiciones se envían al backend.
- `/tracker` muestra posiciones.
- Tracking continúa en background si aplica.
- App no queda en blanco.
- Sin conexión muestra error controlado.
- Reintento funciona.
- Reboot recupera tracking si aplica.

---

## Bugfix tracking

Formato recomendado para documentar bugs Android:

```md
## Bugfix YYYY-MM-DD - nombre

### Síntoma
...

### Causa raíz
...

### Solución permanente
...

### Archivos modificados
- ...

### Prueba
- ...
```

---

## Regla Copilot

Cuando se use Copilot:

1. Abrir un solo archivo.
2. Dar prompt corto.
3. Revisar diff antes de aceptar.
4. No mezclar Android, docs y frontend en el mismo prompt.
5. No permitir que Copilot pegue código React dentro de docs.
6. No permitir que Copilot reemplace documentos completos si solo se pidió agregar una sección.

Ejemplo:

Archivo:

`WebViewActivity.kt`

Prompt:

```txt
Agrega loader y manejo de error sin cambiar lógica existente.
```

---

## No hacer

- No depender solo de WebView para tracking.
- No dejar pantalla blanca.
- No perder tokens.
- No enviar GPS sin auth.
- No subir APK a Play Store para producción.
- No mezclar sandbox/prod en endpoints.
- No usar packages antiguos.
- No agregar SHA sideload/local a `assetlinks.json` productivo.
- No validar App Links productivos con `installer=null`.
- No usar `/tracker-open` como flujo oficial.

---

## Validación cerrada — GeoField GPS / Android App Links

Fecha: 2026-05-09

GeoField GPS quedó validada en Android usando Google Play Internal Testing.

Validación confirmada:

- Package oficial: `com.fenice.geofieldgps`
- Installer correcto: `com.android.vending`
- SHA-256 Google Play App Signing:
  `6B:CF:82:23:06:62:28:20:51:11:0E:72:26:1A:21:D5:37:CF:92:EB:F5:74:AE:A5:D2:76:71:6C:A8:FC:55:D2`
- App Links:
  `app.tugeocercas.com: verified`
- Flujo tracker validado:
  invitación → `/tracker-accept` → runtime token → `/tracker-gps` → envío de posiciones OK.

Reglas:

- No validar App Links productivos con instalaciones sideload (`installer=null`).
- No agregar SHA locales/sideload a `assetlinks.json` productivo.
- El dominio productivo oficial para App Links es `app.tugeocercas.com`.
- `/tracker-open` queda solo como redirect legacy.

---

## Estado actual

Con esto el bloque Android queda alineado con:

- tracker ✅
- auth ✅
- billing ✅
- reports ✅
- api-proxy ✅
- database ✅
- ui/ux ✅
- android ✅

Esto ya es arquitectura de producto real lista para escalar y monetizar.