# Android Foreground Tracking

## Change
Added `ForegroundLocationService.kt` to support persistent GPS tracking on Android.


## Purpose
This service allows tracking to continue in background with a persistent notification.

**All position uploads from the Android tracker use a dedicated runtime token (`tracker_access_token`) for authentication. No user login, web session, or user credentials are required. The tracker only needs the runtime token to send positions to the backend.**

## Manifest updates
- FOREGROUND_SERVICE
- FOREGROUND_SERVICE_LOCATION
- Registered `ForegroundLocationService`


## Notes
This is the base infrastructure for true persistent tracking. When location polling and position upload are connected, each upload will use the runtime token for authentication (not user authentication or session).