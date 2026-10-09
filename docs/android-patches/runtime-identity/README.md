# Isolated Android Preview v16 correction
Apply only to geocercas-twa-preview; applicationId com.fenice.geofieldgps.preview. Original files are preserved with .before suffix. Complete corrected files are archived beside them. Set versionCode=16, versionName=1.2-preview-identity in app/build.gradle. Do not copy Production configuration.

RuntimeIdentityCheck.java.test-only is a temporary Instrumentation harness, excluded from the final APK. Eight assertions passed on the physical Preview device using separate identity_check_tracker_prefs. Recovery was explicitly run using proof retained on that device; the existing Preview renewal endpoint validated membership, billing and identity before native storage was restored. No SQL writes, fabricated credentials, or Production actions.
