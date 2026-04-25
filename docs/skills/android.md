# Skill: Android (TWA + Native Tracking)

## Objetivo
Garantizar que la app Android (TWA + servicios nativos) funcione sin pantallas en blanco, mantenga tracking estable y cumpla requisitos de Google Play.

---

## Arquitectura actual

La app Android usa:

```txt
TWA / WebView + Backend (Vercel + Supabase) + Servicio nativo de ubicación
Flujo:

Usuario abre app
WebView carga app web
Usuario login
Se inicia tracking desde UI
Android recibe tokens
Servicio nativo envía GPS al backend
Backend guarda posiciones
Dashboard refleja datos
Regla crítica
Android NO debe depender solo del WebView para tracking

El tracking debe seguir funcionando en background.

Permisos obligatorios
INTERNET
ACCESS_NETWORK_STATE
ACCESS_FINE_LOCATION
ACCESS_COARSE_LOCATION
ACCESS_BACKGROUND_LOCATION
FOREGROUND_SERVICE
FOREGROUND_SERVICE_LOCATION
RECEIVE_BOOT_COMPLETED
Tracking nativo

Debe usar:

Foreground Service + FusedLocationProviderClient

Responsabilidades:

obtener ubicación periódica
enviar a /api/send-position
manejar reconexión
usar access_token válido
Tokens

Flujo:

WebView obtiene sesión
JS envía tokens a Android:
window.Android.startTracking(accessToken, refreshToken)
Android guarda en:
TokenStore
Servicio usa tokens para enviar posiciones
Regla crítica de tokens
No perder tokens al cerrar app
Manejar refresh_token
No enviar requests sin token válido
WebView

Archivo típico:

WebViewActivity

Reglas:

No dejar pantalla en blanco
Mostrar loader mientras carga
Manejar error de red
Implementar retry
Timeout si no carga
Problema conocido: pantalla blanca
Síntoma

App abre y queda en blanco.

Causa

WebView sin loader/error handler.

Solución permanente
loader visible
mensaje de error
botón retry
Boot automático

Usar:

BootReceiver

Para:

reiniciar tracking después de reboot
verificar si hay tokens guardados
relanzar servicio si aplica
Watchdog

Opcional pero recomendado:

WorkManager (TrackingWatchdogWorker)

Función:

revisar si servicio está activo
relanzarlo si se cayó
Play Store requisitos

Evitar rechazo por:

Broken functionality
no pantallas blancas
no crashes
loader siempre visible
Location policy

Debe existir:

explicación clara del uso de ubicación
uso en background justificado
Data Safety completo
Versionado

Archivo:

app/build.gradle

Reglas:

versionCode SIEMPRE subir
versionName coherente
Build

Generar:

.aab (Android App Bundle)

No usar APK para producción.

Logs

Durante debug:

logs de envío GPS
logs de token
logs de errores WebView

En producción:

no mostrar logs al usuario
Pruebas obligatorias

Antes de subir:

app abre correctamente
login funciona
tracking inicia
tracking continúa en background
app no queda en blanco
sin conexión → error controlado
reintento funciona
reboot → tracking se recupera (si aplica)
Bugfix tracking
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
Regla Copilot

Ejemplo:

Archivo: WebViewActivity.kt

Prompt:
Agrega loader y manejo de error sin cambiar lógica existente.
No hacer
no depender solo de WebView para tracking
no dejar pantalla blanca
no perder tokens
no enviar GPS sin auth
no subir APK a Play Store
no mezclar sandbox/prod en endpoints

---

## 🚀 Push corto

```bash
git add docs/skills/android.md
git commit -m "docs: add android skill [allow-docs]"
git push origin preview
🧠 Estado actual (muy importante)

Con esto ya tienes:

tracker ✅
auth ✅
billing ✅
reports ✅
api-proxy ✅
database ✅
ui/ux ✅
android ✅

👉 Esto ya es arquitectura de producto real listo para escalar + monetizar