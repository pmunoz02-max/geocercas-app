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

## Estado
Pendiente validar en dispositivo:
- ANDROID_BRIDGE startTracking called
- TRACKING_API TrackingService created
- source=tracker-native-android en backend

---
2026-03-31: Android preview URLs actualizadas y versionCode/versionName incrementados para nuevo build de prueba.