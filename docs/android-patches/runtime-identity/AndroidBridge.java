package com.fenice.geofieldgps;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.concurrent.TimeUnit;

public class AndroidBridge {

    /**
     * Llamado desde JS: guarda sesiÃ³n y arranca tracking si hay permiso.
     */
    @JavascriptInterface
    public void startTracking(String token, String trackerUserId, String orgId) {
        String cleanToken = token == null ? "" : token.trim();
        String cleanTrackerUserId = trackerUserId == null ? "" : trackerUserId.trim();
        String cleanOrgId = orgId == null ? "" : orgId.trim();

        if (cleanToken.isEmpty() || cleanTrackerUserId.isEmpty()) {
            Log.e(TAG, "[BRIDGE] startTracking ignored: missing token/trackerUserId");
            return;
        }

        cleanToken = RuntimeSessionRenewal.adoptIncoming(context, cleanToken, cleanTrackerUserId, cleanOrgId);
        if (TextUtils.isEmpty(cleanToken)) return;

        try {
            // Guardar sesiÃ³n en SharedPreferences
            SharedPreferences trackerPrefs = context.getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE);
            SharedPreferences legacyPrefs = context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE);

            trackerPrefs.edit()
                    .putString("tracker_runtime_token", cleanToken)
                    .putString("tracker_access_token", cleanToken)
                    .putString("tracker_token", cleanToken)
                    .putString("access_token", cleanToken)
                    .putString("tracker_user_id", cleanTrackerUserId)
                    .putString("user_id", cleanTrackerUserId)
                    .putString("userId", cleanTrackerUserId)
                    .putBoolean("tracker_enabled", true)
                    .putBoolean("tracker_bridge_ready", true)
                    .apply();

            legacyPrefs.edit()
                    .putString("tracker_runtime_token", cleanToken)
                    .putString("tracker_access_token", cleanToken)
                    .putString("tracker_token", cleanToken)
                    .putString("access_token", cleanToken)
                    .putString("tracker_user_id", cleanTrackerUserId)
                    .putString("user_id", cleanTrackerUserId)
                    .putString("userId", cleanTrackerUserId)
                    .putBoolean("tracker_enabled", true)
                    .putBoolean("tracker_bridge_ready", true)
                    .apply();

            if (!cleanOrgId.isEmpty()) {
                trackerPrefs.edit()
                        .putString("org_id", cleanOrgId)
                        .putString("orgId", cleanOrgId)
                        .putString("tracker_org_id", cleanOrgId)
                        .apply();

                legacyPrefs.edit()
                        .putString("org_id", cleanOrgId)
                        .putString("orgId", cleanOrgId)
                        .putString("geocercas_tracker_org_id", cleanOrgId)
                        .apply();
            }

            setTrackerSession(cleanToken, cleanTrackerUserId);

            // Solo arrancar servicio si hay permiso
            if (!hasLocationPermissions()) {
                Log.w(TAG, "[BRIDGE] startTracking: missing location permission, requesting...");
                requestLocationPermissions();
                return;
            }

            context.stopService(new Intent(context, ForegroundLocationService.class));

            Intent intent = new Intent(context, ForegroundLocationService.class);
            intent.setAction(ForegroundLocationService.ACTION_UPDATE_TRACKER_SESSION);
            intent.putExtra(ForegroundLocationService.EXTRA_ACCESS_TOKEN, cleanToken);
            intent.putExtra(ForegroundLocationService.EXTRA_TRACKER_USER_ID, cleanTrackerUserId);
            if (!cleanOrgId.isEmpty()) {
                intent.putExtra("org_id", cleanOrgId);
            }
            ContextCompat.startForegroundService(context, intent);
            scheduleTrackingWatchdog();

            Log.d(TAG, "[BRIDGE] startTracking: session saved and service started");
        } catch (Exception e) {
            Log.e(TAG, "[BRIDGE] startTracking failed", e);
        }
    }


    private static final String TAG = "ANDROID_BRIDGE";
    private static final String TRACKING_WATCHDOG_WORK = "tracking_watchdog_work";
    private static final int REQ_TRACKER_LOCATION_PERMISSIONS = 2103;

    private static final String TRACKER_PREFS = "tracker_prefs";
    private static final String LEGACY_PREFS = "TrackingServicePrefs";
    private static final String TRACKER_FREQUENCY_MINUTES_KEY = "frequency_minutes";

    private final Context context;

    public AndroidBridge(Context context) {
        this.context = context;
    }

    @JavascriptInterface
    public void saveSession(String token, String orgId) {
        Log.d(TAG, "saveSession(token, orgId) called");

        String cleanToken = token == null ? "" : token.trim();
        String cleanOrgId = orgId == null ? "" : orgId.trim();

        if (cleanToken.isEmpty() || cleanOrgId.isEmpty()) {
            Log.d(TAG, "saveSession(token, orgId) ignored: missing token/orgId");
            return;
        }

        try {
            String trackerUserId = decodeJwtSub(cleanToken);
            if (TextUtils.isEmpty(trackerUserId)) return;
            cleanToken = RuntimeSessionRenewal.adoptIncoming(context, cleanToken, trackerUserId, cleanOrgId);
            if (TextUtils.isEmpty(cleanToken)) return;

            SharedPreferences trackerPrefs = context.getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE);
            SharedPreferences legacyPrefs = context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE);
            Integer frequencyMinutes = decodeJwtFrequencyMinutes(cleanToken);

            if (frequencyMinutes != null && frequencyMinutes >= 1) {
                trackerPrefs.edit().putInt(TRACKER_FREQUENCY_MINUTES_KEY, frequencyMinutes).apply();
            }

            trackerPrefs.edit()
                    .putString("access_token", cleanToken)
                    .putString("tracker_access_token", cleanToken)
                    .putString("org_id", cleanOrgId)
                    .putBoolean("tracker_bridge_ready", true)
                    .putBoolean("tracker_enabled", true)
                    .apply();

            legacyPrefs.edit()
                    .putString("org_id", cleanOrgId)
                    .putString("geocercas_tracker_org_id", cleanOrgId)
                    .putBoolean("tracker_bridge_ready", true)
                    .putBoolean("tracker_enabled", true)
                    .apply();

            if (!TextUtils.isEmpty(trackerUserId)) {
                trackerPrefs.edit().putString("tracker_user_id", trackerUserId).apply();
                setTrackerSession(cleanToken, trackerUserId);
            } else {
                // Only start service if location permission is granted
                if (!hasLocationPermissions()) {
                    Log.w(TAG, "saveSession(token, orgId): missing location permission, requesting...");
                    requestLocationPermissions();
                    // Do NOT start service until permission is granted
                    return;
                }
                Intent intent = new Intent(context, ForegroundLocationService.class);
                intent.putExtra("org_id", cleanOrgId);
                startForegroundServiceCompat(intent);
            }

            Log.d(TAG, "saveSession(token, orgId) saved OK");
        } catch (Exception e) {
            Log.e(TAG, "saveSession(token, orgId) error", e);
        }
    }

    @JavascriptInterface
    public void replaceTrackerToken(String accessToken, String trackerUserId) {
        setTrackerSession(accessToken, trackerUserId);
    }

    @JavascriptInterface
    public void updateTrackerToken(String accessToken) {
        if (accessToken == null || accessToken.trim().isEmpty()) return;

        try {
            String cleanToken = accessToken.trim();

            SharedPreferences trackerPrefs = context.getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE);
            String trackerUserId = trackerPrefs.getString("tracker_user_id", null);

            if (trackerUserId == null || trackerUserId.trim().isEmpty()) {
                trackerUserId = decodeJwtSub(cleanToken);
            }

            if (trackerUserId == null || trackerUserId.trim().isEmpty()) {
                Log.e(TAG, "[BRIDGE] updateTrackerToken ignored: missing tracker_user_id");
                return;
            }

            setTrackerSession(cleanToken, trackerUserId.trim());
            Log.d(TAG, "[BRIDGE] updateTrackerToken redirected to setTrackerSession");
        } catch (Exception e) {
            Log.e(TAG, "[BRIDGE] updateTrackerToken failed", e);
        }
    }

    @JavascriptInterface
    public void setTrackerSession(String accessToken, String trackerUserId) {
        if (accessToken == null || accessToken.trim().isEmpty()) return;
        if (trackerUserId == null || trackerUserId.trim().isEmpty()) return;

        String cleanToken = accessToken.trim();
        String cleanTrackerUserId = trackerUserId.trim();
        SharedPreferences trackerPrefs = context.getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE);
        String currentOrgId = trackerPrefs.getString("org_id", null);

        Log.d(TAG, "[BRIDGE] setTrackerSession called tokenPresent=" + (!cleanToken.isEmpty()) + " trackerUserId=" + cleanTrackerUserId + " orgId=" + (currentOrgId != null ? currentOrgId : "null"));

        try {
            String jwtSub = decodeJwtSub(cleanToken);
            if (jwtSub == null || jwtSub.trim().isEmpty()) {
                Log.e(TAG, "[BRIDGE] setTrackerSession blocked: JWT sub missing");
                return;
            }

            Integer frequencyMinutes = decodeJwtFrequencyMinutes(cleanToken);

            if (!cleanTrackerUserId.equals(jwtSub.trim())) {
                Log.e(TAG, "[BRIDGE] setTrackerSession blocked: tracker_user_id != jwt.sub");
                return;
            }

            cleanToken = RuntimeSessionRenewal.adoptIncoming(context, cleanToken, cleanTrackerUserId, currentOrgId == null ? "" : currentOrgId);
            if (TextUtils.isEmpty(cleanToken)) return;
            SharedPreferences legacyPrefs = context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE);

            trackerPrefs.edit()
                    .remove("auth_token")
                    .remove("tracker_token")
                    .remove("owner_token")
                    .remove("session_token")
                    .remove("access_token")
                    .remove("tracker_user_id")
                    .apply();

            legacyPrefs.edit()
                    .remove("auth_token")
                    .remove("tracker_token")
                    .remove("owner_token")
                    .remove("session_token")
                    .remove("tracker_user_id")
                    .apply();

            SharedPreferences.Editor trackerEditor = trackerPrefs.edit()
                    .putString("access_token", cleanToken)
                    .putString("tracker_access_token", cleanToken)
                    .putString("tracker_user_id", cleanTrackerUserId)
                    .putBoolean("token_replaced", true)
                    .putBoolean("tracker_enabled", true)
                    .putBoolean("tracker_bridge_ready", true);

            if (!TextUtils.isEmpty(currentOrgId)) {
                trackerEditor.putString("org_id", currentOrgId);
            }

            if (frequencyMinutes != null && frequencyMinutes >= 1) {
                trackerEditor.putInt(TRACKER_FREQUENCY_MINUTES_KEY, frequencyMinutes);
            }

            trackerEditor.apply();

            legacyPrefs.edit()
                    .putBoolean("tracker_enabled", true)
                    .putBoolean("tracker_bridge_ready", true)
                    .apply();

            // Only start service if location permission is granted
            if (!hasLocationPermissions()) {
                Log.w(TAG, "[BRIDGE] setTrackerSession: missing location permission, requesting...");
                requestLocationPermissions();
                // Do NOT start service until permission is granted
                return;
            }

            Intent intent = new Intent(context, ForegroundLocationService.class);
            intent.setAction(ForegroundLocationService.ACTION_UPDATE_TRACKER_SESSION);
            intent.putExtra(ForegroundLocationService.EXTRA_ACCESS_TOKEN, cleanToken);
            intent.putExtra(ForegroundLocationService.EXTRA_TRACKER_USER_ID, cleanTrackerUserId);
            if (!TextUtils.isEmpty(currentOrgId)) {
                intent.putExtra("org_id", currentOrgId);
            }
            Log.d(TAG, "[BRIDGE] setTrackerSession requesting ForegroundLocationService start orgId=" + (currentOrgId != null ? currentOrgId : "null"));
            startForegroundServiceCompat(intent);

            Log.d(TAG, "[BRIDGE] setTrackerSession ok tracker_user_id=" + cleanTrackerUserId);
        } catch (Exception e) {
            Log.e(TAG, "[BRIDGE] setTrackerSession failed", e);
        }
    }

    /**
     * MÃ©todo esperado por TrackerGpsPage.jsx.
     * Guarda orgId antes de llamar setTrackerSession para que el servicio arranque con contexto completo.
     */
    @JavascriptInterface
    public void saveTrackerSession(String runtimeToken, String trackerUserId, String orgId) {
        String cleanToken = runtimeToken == null ? "" : runtimeToken.trim();
        String cleanTrackerUserId = trackerUserId == null ? "" : trackerUserId.trim();
        String cleanOrgId = orgId == null ? "" : orgId.trim();

        if (cleanToken.isEmpty() || cleanTrackerUserId.isEmpty()) {
            Log.e(TAG, "[BRIDGE] saveTrackerSession ignored: missing runtimeToken/trackerUserId");
            return;
        }

        cleanToken = RuntimeSessionRenewal.adoptIncoming(context, cleanToken, cleanTrackerUserId, cleanOrgId);
        if (TextUtils.isEmpty(cleanToken)) return;

        try {
            // Guardar siempre token, trackerUserId y orgId antes de revisar permisos
            SharedPreferences trackerPrefs = context.getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE);
            SharedPreferences legacyPrefs = context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE);

            trackerPrefs.edit()
                    .putString("tracker_runtime_token", cleanToken)
                    .putString("tracker_access_token", cleanToken)
                    .putString("tracker_token", cleanToken)
                    .putString("access_token", cleanToken) // fallback legacy
                    .putString("tracker_user_id", cleanTrackerUserId)
                    .putString("user_id", cleanTrackerUserId)
                    .putString("userId", cleanTrackerUserId)
                    .putBoolean("tracker_enabled", true)
                    .putBoolean("tracker_bridge_ready", true)
                    .apply();

            legacyPrefs.edit()
                    .putString("tracker_runtime_token", cleanToken)
                    .putString("tracker_access_token", cleanToken)
                    .putString("tracker_token", cleanToken)
                    .putString("access_token", cleanToken)
                    .putString("tracker_user_id", cleanTrackerUserId)
                    .putString("user_id", cleanTrackerUserId)
                    .putString("userId", cleanTrackerUserId)
                    .putBoolean("tracker_enabled", true)
                    .putBoolean("tracker_bridge_ready", true)
                    .apply();

            if (!cleanOrgId.isEmpty()) {
                trackerPrefs.edit()
                        .putString("org_id", cleanOrgId)
                        .putString("orgId", cleanOrgId)
                        .putString("tracker_org_id", cleanOrgId)
                        .apply();

                legacyPrefs.edit()
                        .putString("org_id", cleanOrgId)
                        .putString("orgId", cleanOrgId)
                        .putString("geocercas_tracker_org_id", cleanOrgId)
                        .apply();
            }

            Log.d(TAG, "[BRIDGE] saveTrackerSession called tokenPresent=true trackerUserId=" + cleanTrackerUserId + " orgId=" + (!cleanOrgId.isEmpty() ? cleanOrgId : "null"));

            // Revisar permisos despuÃ©s de guardar
            if (!hasLocationPermissions()) {
                Log.w(TAG, "[BRIDGE] saveTrackerSession: missing location permission, requesting...");
                requestLocationPermissions();
                // Do NOT start service until permission is granted
                return;
            }

            // Reiniciar ForegroundLocationService con la nueva sesiÃ³n
            context.stopService(new Intent(context, ForegroundLocationService.class));

            Intent intent = new Intent(context, ForegroundLocationService.class);
            intent.setAction(ForegroundLocationService.ACTION_UPDATE_TRACKER_SESSION);
            intent.putExtra(ForegroundLocationService.EXTRA_ACCESS_TOKEN, cleanToken);
            intent.putExtra(ForegroundLocationService.EXTRA_TRACKER_USER_ID, cleanTrackerUserId);
            if (!cleanOrgId.isEmpty()) {
                intent.putExtra("org_id", cleanOrgId);
            }
            ContextCompat.startForegroundService(context, intent);

            setTrackerSession(cleanToken, cleanTrackerUserId);
        } catch (Exception e) {
            Log.e(TAG, "[BRIDGE] saveTrackerSession failed", e);
        }
    }

    /** MÃ©todo esperado por TrackerGpsPage.jsx. */
    @JavascriptInterface
    public void requestStartTracking() {
        Log.d(TAG, "[BRIDGE] requestStartTracking called");
        startTracking();
    }


    public void startTracking(String accessToken, String refreshToken) {
        boolean tokenPresent = accessToken != null && !accessToken.trim().isEmpty();
        String safeToken = tokenPresent ? accessToken.trim() : "";
        String trackerUserId = null;
        String currentOrgId = null;

        try {
            SharedPreferences trackerPrefs = context.getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE);
            currentOrgId = trackerPrefs.getString("org_id", null);

            // Log token and org_id when called
            Log.i(TAG, "startTracking called with token=" + (safeToken.isEmpty() ? "(empty)" : "***") + " org_id=" + (currentOrgId != null ? currentOrgId : "null"));

            if (tokenPresent) {
                trackerUserId = decodeJwtSub(safeToken);
            }

            Log.d(TAG, "[BRIDGE] startTracking(accessToken, refreshToken) called tokenPresent=" + tokenPresent + " trackerUserId=" + (trackerUserId != null ? trackerUserId : "null") + " orgId=" + (currentOrgId != null ? currentOrgId : "null"));

            if (tokenPresent && !TextUtils.isEmpty(trackerUserId)) {
                setTrackerSession(safeToken, trackerUserId);
            }

            trackerPrefs.edit().putBoolean("tracker_enabled", true).apply();

            // Only start service if location permission is granted
            if (!hasLocationPermissions()) {
                Log.w(TAG, "startTracking: missing location permission, requesting...");
                requestLocationPermissions();
                // Do NOT start service until permission is granted
                return;
            }

            Intent fgIntent = new Intent(context, ForegroundLocationService.class);
            Log.d(TAG, "[BRIDGE] startTracking requesting ForegroundLocationService start");
            startForegroundServiceCompat(fgIntent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start ForegroundLocationService", e);
        }

        scheduleTrackingWatchdog();
    }

    @JavascriptInterface
    public void startTracking() {
        SharedPreferences trackerPrefs = context.getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE);
        String orgId = trackerPrefs.getString("org_id", null);
        Log.i(TAG, "startTracking() called without tokens org_id=" + (orgId != null ? orgId : "null"));
        Log.d(TAG, "startTracking() called without tokens");

        // Verificar permiso de ubicaciÃ³n antes de iniciar el servicio
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            if (context instanceof Activity) {
                Log.w(TAG, "ACCESS_FINE_LOCATION not granted, requesting permission");
                ActivityCompat.requestPermissions((Activity) context, new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, REQ_TRACKER_LOCATION_PERMISSIONS);
                // No iniciar el servicio hasta que el permiso sea concedido
                return;
            } else {
                Log.e(TAG, "Context is not an Activity, cannot request location permission");
                return;
            }
        }
        startService();
        scheduleTrackingWatchdog();
    }

    @JavascriptInterface
    public void startService() {
        Log.d(TAG, "startService called from JS");
        try {
            SharedPreferences trackerPrefs = context.getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE);
            String currentOrgId = trackerPrefs.getString("org_id", null);
            trackerPrefs.edit().putBoolean("tracker_enabled", true).apply();

            // Only start service if location permission is granted
            if (!hasLocationPermissions()) {
                Log.w(TAG, "startService: missing location permission, requesting...");
                requestLocationPermissions();
                // Do NOT start service until permission is granted
                return;
            }

            Log.d(TAG, "[BRIDGE] startService called trackerUserId=" + trackerPrefs.getString("tracker_user_id", "null") + " orgId=" + (currentOrgId != null ? currentOrgId : "null") + " requesting ForegroundLocationService start");
            Intent fgIntent = new Intent(context, ForegroundLocationService.class);
            startForegroundServiceCompat(fgIntent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start ForegroundLocationService", e);
        }
    }

    @JavascriptInterface
    public void stopTracking() {
        Log.d(TAG, "stopTracking called");
        try {
            SharedPreferences trackerPrefs = context.getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE);
            SharedPreferences legacyPrefs = context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE);

            trackerPrefs.edit().putBoolean("tracker_enabled", false).apply();
            legacyPrefs.edit().putBoolean("tracker_enabled", false).apply();

            Intent foregroundStopIntent = ForegroundLocationService.createStopIntent(context);
            startForegroundServiceCompat(foregroundStopIntent);
            Log.d(TAG, "Requesting ForegroundLocationService graceful stop");
        } catch (Exception e) {
            Log.e(TAG, "Failed to request ForegroundLocationService stop", e);
        }
    }

    @JavascriptInterface
    public boolean hasPermissions() {
        return hasLocationPermissions();
    }

    @JavascriptInterface
    public boolean isPermissionsOk() {
        return hasLocationPermissions();
    }

    @JavascriptInterface
    public boolean isBackgroundAllowed() {
        return hasLocationPermissions() && !TrackingSettingsHelper.INSTANCE.isBackgroundRestricted(context);
    }

    @JavascriptInterface
    public boolean isIgnoringBatteryOptimizations() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                Log.d(TAG, "[BATTERY] isIgnoringBatteryOptimizations: unsupported API, treating as true");
                return true;
            }

            PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            boolean ignoring = powerManager != null
                    && powerManager.isIgnoringBatteryOptimizations(context.getPackageName());
            Log.d(TAG, "[BATTERY] isIgnoringBatteryOptimizations=" + ignoring);
            return ignoring;
        } catch (Exception e) {
            Log.e(TAG, "[BATTERY] isIgnoringBatteryOptimizations error", e);
            return false;
        }
    }

    @JavascriptInterface
    public String getBatteryOptimizationStatus() {
        try {
            boolean supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M;
            boolean ignoring = !supported || isIgnoringBatteryOptimizations();

            JSONObject json = new JSONObject();
            json.put("supported", supported);
            json.put("ignoring", ignoring);

            String result = json.toString();
            Log.d(TAG, "[BATTERY] getBatteryOptimizationStatus=" + result);
            return result;
        } catch (Exception e) {
            Log.e(TAG, "[BATTERY] getBatteryOptimizationStatus error", e);
            return "{\"supported\":false,\"ignoring\":false}";
        }
    }

    @JavascriptInterface
    public boolean requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            Log.d(TAG, "[BATTERY] requestIgnoreBatteryOptimizations skipped: SDK < M");
            return true;
        }

        try {
            if (isIgnoringBatteryOptimizations()) {
                Log.d(TAG, "[BATTERY] requestIgnoreBatteryOptimizations skipped: already ignoring");
                return true;
            }

            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            Log.d(TAG, "[BATTERY] requestIgnoreBatteryOptimizations launched");
            return true;
        } catch (Exception e) {
            Log.e(TAG, "[BATTERY] requestIgnoreBatteryOptimizations request action failed", e);

            try {
                Intent fallbackIntent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallbackIntent);
                Log.d(TAG, "[BATTERY] requestIgnoreBatteryOptimizations fallback launched");
                return true;
            } catch (Exception fallbackError) {
                Log.e(TAG, "[BATTERY] requestIgnoreBatteryOptimizations fallback failed", fallbackError);
                return false;
            }
        }
    }

    @JavascriptInterface
    public boolean isServiceRunning() {
        try {
            SharedPreferences prefs = context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE);
            boolean prefState = prefs.getBoolean("service_running", false);
            return prefState
                    || isServiceClassRunning(ForegroundLocationService.class.getName())
                    || isServiceClassRunning(TrackingService.class.getName());
        } catch (Exception e) {
            Log.e(TAG, "isServiceRunning error", e);
            return false;
        }
    }

    @JavascriptInterface
    public boolean requestPermissions() {
        return requestLocationPermissions();
    }

    @JavascriptInterface
    public boolean requestLocationPermissions() {
        try {
            Log.d(TAG, "requestLocationPermissions called");

            if (!(context instanceof Activity)) {
                Log.e(TAG, "requestLocationPermissions failed: context is not an Activity");
                return false;
            }

            final Activity activity = (Activity) context;
            if (hasLocationPermissions()) {
                Log.d(TAG, "requestLocationPermissions: already granted");
                return true;
            }

            activity.runOnUiThread(() -> {
                try {
                    boolean hasFine = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION)
                            == PackageManager.PERMISSION_GRANTED;
                    boolean hasCoarse = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION)
                            == PackageManager.PERMISSION_GRANTED;
                    boolean hasForeground = hasFine && hasCoarse;

                    if (!hasForeground) {
                        Log.d(TAG, "requesting foreground location");

                        ArrayList<String> foregroundMissing = new ArrayList<>();
                        if (!hasFine) foregroundMissing.add(Manifest.permission.ACCESS_FINE_LOCATION);
                        if (!hasCoarse) foregroundMissing.add(Manifest.permission.ACCESS_COARSE_LOCATION);

                        ActivityCompat.requestPermissions(
                                activity,
                                foregroundMissing.toArray(new String[0]),
                                REQ_TRACKER_LOCATION_PERMISSIONS
                        );
                        Log.d(TAG, "requestLocationPermissions stage1 requested: " + foregroundMissing);
                        return;
                    }

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        boolean hasBackground = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                                == PackageManager.PERMISSION_GRANTED;

                        if (!hasBackground) {
                            Log.d(TAG, "requesting background location");

                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                                Log.d(TAG, "requestLocationPermissions stage2: opening app settings for background location");
                                openAppPermissionSettings(activity);
                            } else {
                                ActivityCompat.requestPermissions(
                                        activity,
                                        new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION},
                                        REQ_TRACKER_LOCATION_PERMISSIONS
                                );
                                Log.d(TAG, "requestLocationPermissions stage2 requested: ACCESS_BACKGROUND_LOCATION");
                            }
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "requestLocationPermissions UI request failed", e);
                }
            });

            return true;
        } catch (Exception e) {
            Log.e(TAG, "requestLocationPermissions error", e);
            return false;
        }
    }

    @JavascriptInterface
    public void saveSession(String token, String refreshToken, long expiresAt, String orgId) {
        try {
            SharedPreferences trackerPrefs = context.getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE);
            SharedPreferences legacyPrefs = context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE);

            String cleanToken = token == null ? "" : token.trim();
            String cleanRefresh = refreshToken == null ? "" : refreshToken.trim();
            String cleanOrgId = orgId == null ? "" : orgId.trim();
            String trackerUserId = decodeJwtSub(cleanToken);
            if (TextUtils.isEmpty(trackerUserId)) return;
            cleanToken = RuntimeSessionRenewal.adoptIncoming(context, cleanToken, trackerUserId, cleanOrgId);
            if (TextUtils.isEmpty(cleanToken)) return;
            Integer frequencyMinutes = decodeJwtFrequencyMinutes(cleanToken);

            if (frequencyMinutes != null && frequencyMinutes >= 1) {
                trackerPrefs.edit().putInt(TRACKER_FREQUENCY_MINUTES_KEY, frequencyMinutes).apply();
            }

            trackerPrefs.edit()
                    .putString("access_token", cleanToken)
                    .putString("tracker_access_token", cleanToken)
                    .putString("refresh_token", cleanRefresh)
                    .putLong("expires_at", expiresAt)
                    .putString("org_id", cleanOrgId)
                    .putBoolean("tracker_bridge_ready", true)
                    .putBoolean("tracker_enabled", true)
                    .apply();

            if (!TextUtils.isEmpty(trackerUserId)) {
                trackerPrefs.edit().putString("tracker_user_id", trackerUserId).apply();
            }

            legacyPrefs.edit()
                    .putString("org_id", cleanOrgId)
                    .putString("geocercas_tracker_org_id", cleanOrgId)
                    .putBoolean("tracker_bridge_ready", true)
                    .putBoolean("tracker_enabled", true)
                    .apply();

            if (!TextUtils.isEmpty(cleanToken) && !TextUtils.isEmpty(trackerUserId)) {
                setTrackerSession(cleanToken, trackerUserId);
            } else {
                // Only start service if location permission is granted
                if (!hasLocationPermissions()) {
                    Log.w(TAG, "saveSession(token, refreshToken, expiresAt, orgId): missing location permission, requesting...");
                    requestLocationPermissions();
                    // Do NOT start service until permission is granted
                    return;
                }
                Intent intent = new Intent(context, ForegroundLocationService.class);
                if (!TextUtils.isEmpty(cleanOrgId)) {
                    intent.putExtra("org_id", cleanOrgId);
                }
                startForegroundServiceCompat(intent);
            }

            Log.d(
                    TAG,
                    "saveSession(token, refreshToken, expiresAt, orgId) called: token="
                            + (!cleanToken.isEmpty() ? "present" : "missing")
                            + ", refresh_token=" + (!cleanRefresh.isEmpty() ? "present" : "missing")
                            + ", expires_at=" + expiresAt
                            + ", org_id=" + (!cleanOrgId.isEmpty() ? cleanOrgId : "missing")
            );
        } catch (Exception e) {
            Log.e(TAG, "saveSession error", e);
        }
    }

    @JavascriptInterface
    public String getTrackingDiagnosticsJson() {
        try {
            JSONObject json = new JSONObject();
            json.put("manufacturer", TrackingSettingsHelper.INSTANCE.getManufacturer());
            json.put("sdk_int", Build.VERSION.SDK_INT);
            json.put(
                    "battery_optimization_ignored",
                    TrackingSettingsHelper.INSTANCE.isIgnoringBatteryOptimizations(context)
            );
            json.put(
                    "background_restricted",
                    TrackingSettingsHelper.INSTANCE.isBackgroundRestricted(context)
            );

            String result = json.toString();
            Log.d(TAG, "Diagnostics JSON: " + result);
            return result;
        } catch (Exception e) {
            Log.e(TAG, "getTrackingDiagnosticsJson error", e);
            return "{}";
        }
    }

    @JavascriptInterface
    public void openBatteryOptimizationSettings() {
        runOnActivityUiThread(activity -> {
            TrackingSettingsHelper.INSTANCE.openBatteryOptimizationSettings(activity);
            Log.d(TAG, "Opened battery optimization settings");
        }, "openBatteryOptimizationSettings");
    }

    @JavascriptInterface
    public void openAppBatterySettings() {
        runOnActivityUiThread(activity -> {
            TrackingSettingsHelper.INSTANCE.openAppBatterySettings(activity);
            Log.d(TAG, "Opened app battery settings");
        }, "openAppBatterySettings");
    }

    @JavascriptInterface
    public void openAutoStartSettings() {
        runOnActivityUiThread(activity -> {
            TrackingSettingsHelper.INSTANCE.openAutoStartSettingsBestEffort(activity);
            Log.d(TAG, "Opened auto start settings");
        }, "openAutoStartSettings");
    }

    private void startForegroundServiceCompat(Intent intent) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "startForegroundServiceCompat failed", e);
        }
    }

    private void scheduleTrackingWatchdog() {
        try {
            PeriodicWorkRequest workRequest =
                    new PeriodicWorkRequest.Builder(
                            TrackingWatchdogWorker.class,
                            15,
                            TimeUnit.MINUTES
                    ).build();

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                    TRACKING_WATCHDOG_WORK,
                    ExistingPeriodicWorkPolicy.UPDATE,
                    workRequest
            );

            Log.d(TAG, "[BRIDGE] tracking watchdog scheduled");
        } catch (Exception e) {
            Log.e(TAG, "scheduleTrackingWatchdog failed", e);
        }
    }

    private boolean hasLocationPermissions() {
        try {
            boolean hasFine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
            boolean hasCoarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                boolean hasBackground = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                        == PackageManager.PERMISSION_GRANTED;
                return hasFine && hasCoarse && hasBackground;
            }

            return hasFine && hasCoarse;
        } catch (Exception e) {
            Log.e(TAG, "hasLocationPermissions error", e);
            return false;
        }
    }

    private boolean isServiceClassRunning(String className) {
        try {
            ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (manager == null) return false;

            for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(Integer.MAX_VALUE)) {
                if (service.service != null && className.equals(service.service.getClassName())) {
                    return true;
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "isServiceClassRunning error for " + className, e);
        }
        return false;
    }

    private void openAppPermissionSettings(Activity activity) {
        try {
            Intent intent = new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", activity.getPackageName(), null)
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "openAppPermissionSettings error", e);
        }
    }

    private void runOnActivityUiThread(ActivityAction action, String actionName) {
        try {
            if (!(context instanceof Activity)) {
                Log.e(TAG, actionName + " failed: context is not an Activity");
                return;
            }

            Activity activity = (Activity) context;
            activity.runOnUiThread(() -> {
                try {
                    action.run(activity);
                } catch (Exception e) {
                    Log.e(TAG, actionName + " UI action failed", e);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, actionName + " error", e);
        }
    }

    private String decodeJwtSub(String token) {
        try {
            if (token == null || token.trim().isEmpty()) return null;

            String[] parts = token.split("\\.");
            if (parts.length != 3) return null;

            String payload = parts[1]
                    .replace('-', '+')
                    .replace('_', '/');

            int mod = payload.length() % 4;
            if (mod == 2) {
                payload = payload + "==";
            } else if (mod == 3) {
                payload = payload + "=";
            }

            byte[] decoded = Base64.decode(payload, Base64.DEFAULT);
            JSONObject json = new JSONObject(new String(decoded, StandardCharsets.UTF_8));
            String sub = json.optString("sub", null);
            return (sub != null && !sub.trim().isEmpty()) ? sub.trim() : null;
        } catch (Exception e) {
            Log.e(TAG, "[JWT] decodeJwtSub failed", e);
            return null;
        }
    }

    private Integer decodeJwtFrequencyMinutes(String token) {
        try {
            if (token == null || token.trim().isEmpty()) return null;

            String[] parts = token.split("\\.");
            if (parts.length != 3) return null;

            String payload = parts[1]
                    .replace('-', '+')
                    .replace('_', '/');

            int mod = payload.length() % 4;
            if (mod == 2) {
                payload = payload + "==";
            } else if (mod == 3) {
                payload = payload + "=";
            }

            byte[] decoded = Base64.decode(payload, Base64.DEFAULT);
            JSONObject json = new JSONObject(new String(decoded, StandardCharsets.UTF_8));

            if (!json.has("frequency_minutes")) return null;

            int value = json.optInt("frequency_minutes", 0);
            return value >= 1 ? value : null;
        } catch (Exception e) {
            Log.e(TAG, "[JWT] decodeJwtFrequencyMinutes failed", e);
            return null;
        }
    }

    private interface ActivityAction {
        void run(Activity activity);
    }
}

