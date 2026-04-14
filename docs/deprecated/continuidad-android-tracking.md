# Continuidad Android Tracking

## Cambio
Se instrumentó el flujo de tracking nativo Android para validar el bridge WebView -> AndroidBridge -> TrackingService.

## Archivos
- geocercas-twa/app/src/main/java/com/fenice/geocercas/WebViewActivity.java
- geocercas-twa/app/src/main/java/com/fenice/geocercas/AndroidBridge.java
- geocercas-twa/app/src/main/java/com/fenice/geocercas/TrackingService.kt
- geocercas-twa/app/src/main/java/com/fenice/geocercas/TokenStore.java


## Objetivo
Que el tracking deje de depender del runtime web y pase a un Foreground Service nativo.

**El tracking en Android utiliza exclusivamente un token de acceso de runtime (`tracker_access_token`) para autenticar cada envío de posición. No depende de autenticación de usuario, sesión web ni credenciales de usuario. Solo el token runtime es necesario para que el servicio nativo pueda reportar posiciones al backend.**


## Estado
Pendiente validar en dispositivo:
- ANDROID_BRIDGE startTracking called
- TRACKING_API TrackingService created
- source=tracker-native-android en backend

Cada envío de posición desde el servicio nativo usará el token runtime para autenticación, nunca autenticación de usuario o sesión web.

---
2026-03-31: Android preview URLs actualizadas y versionCode/versionName incrementados para nuevo build de prueba.