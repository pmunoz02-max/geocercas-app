# Android Foreground Tracking

## Change
Added `ForegroundLocationService.kt` to support persistent GPS tracking on Android.

## Purpose
This service allows tracking to continue in background with a persistent notification.

## Manifest updates
- FOREGROUND_SERVICE
- FOREGROUND_SERVICE_LOCATION
- Registered `ForegroundLocationService`

## Notes
This is the base infrastructure for true persistent tracking. Location polling and position upload will be connected in the next step.