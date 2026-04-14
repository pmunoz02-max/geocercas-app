# Tracker Android Bootstrap Without Web Session

## Context
Android tracker flow can receive a valid access_token and org_id via deep link without establishing a traditional web session.

## Problem
The frontend required a web session to start tracking, causing:
- service_running = false
- tracker_health.status = offline
- tracking not starting even with valid assignment

## Solution
Allow tracker bootstrap when:
- Android bridge is available (window.Android)
- Backend assignment is found
- Permissions are granted

Even if web session is missing.

## Implementation
TrackerGpsPage now:
- reads org_id from URL/localStorage
- calls backend /api/tracker-active-assignment
- if assignment exists:
  - calls Android.startTracking()
  - starts ForegroundService

## Result
- tracking starts without web session dependency
- service_running becomes true
- tracker sends positions correctly

## Important
Web session is no longer required for Android tracker bootstrap.