// --- CANONICAL TRACKER RUNTIME TOKEN RULE ---
// ÃšNICA fuente vÃ¡lida de token para tracking:
//   - runtimeAccessToken
//   - tracker_prefs.access_token
// PROHIBIDO fallback a:
//   - auth_token
//   - owner_token
//   - legacy tokens
// Antes de cada envÃ­o, el token debe pertenecer al tracker_user_id esperado y reemplazarse de forma fuerte si llega un bootstrap nuevo.
// Esto estÃ¡ documentado y es obligatorio.

package com.fenice.geofieldgps

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Base64
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class ForegroundLocationService : Service() {

    @Volatile
    private var lastLocationUpdateAt: Long = 0L

    @Volatile
    private var locationUpdatesStarted = false

    @Volatile
    private var foregroundStarted = false

    @Volatile
    private var runtimeAccessToken: String? = null

    @Volatile
    private var runtimeTrackerUserId: String? = null

    @Volatile
    private var queueProcessing = false

    @Volatile
    private var queueAuthPaused = false

    @Volatile
    private var queueAuthPausedTokenHashPrefix: String? = null

    @Volatile
    private var lastRecoveryAttemptAt: Long = 0L

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback

    private val queueLock = Any()
    private val httpClient by lazy { OkHttpClient() }
    private var wakeLock: PowerManager.WakeLock? = null

    private val watchdogHandler by lazy { Handler(Looper.getMainLooper()) }

    private val watchdogRunnable = object : Runnable {
        override fun run() {
            try {
                val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
                val trackerEnabled = trackerPrefs.getBoolean(TRACKER_ENABLED_KEY, false)

                if (!trackerEnabled) {
                    Log.d(TAG, "[WATCHDOG] tracker disabled, skipping")
                } else {
                    val now = System.currentTimeMillis()
                    val staleForMs = now - lastLocationUpdateAt

                    if (!locationUpdatesStarted) {
                        Log.w(TAG, "[WATCHDOG] location updates not started, trying recovery")
                        maybeRecoverLocationUpdates(now)
                    } else if (lastLocationUpdateAt <= 0L || staleForMs >= LOCATION_STALE_MS) {
                        Log.w(TAG, "[WATCHDOG] stale updates detected staleForMs=$staleForMs, trying recovery")
                        maybeRecoverLocationUpdates(now)
                    } else {
                        Log.d(TAG, "[WATCHDOG] updates healthy staleForMs=$staleForMs")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "[WATCHDOG] failed", e)
            } finally {
                watchdogHandler.postDelayed(this, 30_000L)
            }
        }
    }

    private data class TokenCandidate(
        val source: String,
        val token: String,
        val trackerUserId: String,
    )

    companion object {
        private const val TAG = "ForegroundLocationService"
        const val CHANNEL_ID = "tracker_channel"
        const val NOTIFICATION_ID = 1001

        const val EXTRA_ACTION = "action"
        const val ACTION_STOP = "stop"

        const val EXTRA_ACCESS_TOKEN = "access_token"
        const val EXTRA_TRACKER_USER_ID = "tracker_user_id"

        const val ACTION_UPDATE_TRACKER_SESSION = "com.fenice.geofieldgps.ACTION_UPDATE_TRACKER_SESSION"
        const val ACTION_UPDATE_TRACKER_TOKEN = "UPDATE_TRACKER_TOKEN"

        private const val REQUEST_URL = "https://preview.tugeocercas.com/api/send-position"
        private const val TRACKER_PREFS = "tracker_prefs"
        private const val LEGACY_PREFS = "TrackingServicePrefs"
        private const val TRACKER_FREQUENCY_MINUTES_KEY = "frequency_minutes"
        private const val TRACKER_ENABLED_KEY = "tracker_enabled"
        private const val POSITION_QUEUE_KEY = "pending_position_queue"
        private const val LAST_SENT_POSITION_KEY = "last_sent_position"
        private const val QUEUE_AUTH_PAUSED_KEY = "pending_queue_auth_paused"
        private const val QUEUE_AUTH_PAUSED_TOKEN_HASH_PREFIX_KEY = "pending_queue_auth_paused_token_hash_prefix"
        private const val LAST_RUNTIME_TOKEN_HASH_PREFIX_KEY = "last_runtime_token_hash_prefix"
        private const val DEFAULT_FREQUENCY_MINUTES = 1
        private const val MAX_QUEUE_SIZE = 500
        private const val BASE_BACKOFF_MS = 5_000L
        private const val MAX_BACKOFF_MS = 15 * 60 * 1000L
        private const val DEFAULT_MIN_UPDATE_INTERVAL_MS = 5_000L
        private const val MIN_ALLOWED_INTERVAL_MS = 60_000L
        private const val DEDUPE_DISTANCE_METERS = 12f
        private const val DEDUPE_WINDOW_MS = 15_000L
        private const val ACCURACY_IMPROVEMENT_METERS = 5f
        private const val BRIDGE_READY_KEY = "tracker_bridge_ready"
        private const val ASSIGNMENT_RESOLVED_KEY = "tracker_assignment_resolved"
        private const val LOCATION_STALE_MS = 60_000L
        private const val LOCATION_RECOVERY_COOLDOWN_MS = 30_000L

        @Volatile
        private var running: Boolean = false

        @JvmStatic
        fun isRunning(): Boolean = running

        @JvmStatic
        fun createStopIntent(context: Context): Intent =
            Intent(context, ForegroundLocationService::class.java).apply {
                putExtra(EXTRA_ACTION, ACTION_STOP)
            }

        @JvmStatic
        fun startServiceSafe(context: Context) {
            try {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    Log.w("SERVICE_SAFE", "ForegroundLocationService start skipped: ACCESS_FINE_LOCATION not granted")
                    return
                }
                val intent = Intent(context, ForegroundLocationService::class.java)
                ContextCompat.startForegroundService(context, intent)
                Log.d("SERVICE_SAFE", "ForegroundLocationService start requested via startServiceSafe")
            } catch (e: Exception) {
                Log.e("SERVICE_SAFE", "Failed to start ForegroundLocationService", e)
            }
        }
    }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.action ?: return
            val now = System.currentTimeMillis()
            when (action) {
                Intent.ACTION_SCREEN_ON,
                Intent.ACTION_USER_PRESENT,
                -> maybeRecoverLocationUpdates(now)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        promoteToForegroundIfNeeded("onCreate")

        preloadRuntimeSessionFromPrefs()
        loadQueueAuthPauseFromPrefs()

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                Log.d(TAG, "[LOCATION_CALLBACK] onLocationResult entered with ${locationResult.locations.size} locations")
                lastLocationUpdateAt = System.currentTimeMillis()
                for (location in locationResult.locations) {
                    Log.d(TAG, "ForegroundLocationService: LOCATION lat=${location.latitude} lng=${location.longitude}")
                    Log.d(TAG, "[LOCATION_RECEIVED] lat=${location.latitude} lng=${location.longitude} accuracy=${location.accuracy}")
                    sendPositionToBackend(location.latitude, location.longitude, location.accuracy)
                }
            }
        }

        registerReceiver(
            screenReceiver,
            IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_ON)
                addAction(Intent.ACTION_USER_PRESENT)
            },
        )

        running = true

        watchdogHandler.removeCallbacks(watchdogRunnable)
        watchdogHandler.postDelayed(watchdogRunnable, 30_000L)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        val trackerUserId = trackerPrefs.getString("tracker_user_id", null)?.take(12) ?: "(none)"
        val orgId = trackerPrefs.getString("org_id", null)?.take(12) ?: "(none)"
        val accessToken = trackerPrefs.getString("access_token", null)
        val jwtSub = getJwtSub(accessToken)?.take(12) ?: "(none)"
        val queueLen = try {
            val q = trackerPrefs.getString(POSITION_QUEUE_KEY, null)
            if (q.isNullOrBlank()) 0 else JSONArray(q).length()
        } catch (_: Exception) {
            0
        }

        // A foreground service must promote itself immediately after startForegroundService().
        // Keep this before any return path to avoid ForegroundServiceDidNotStartInTimeException.
        promoteToForegroundIfNeeded("onStartCommand")

        Log.d(TAG, "[SERVICE] action=${intent?.action}")
        Log.d(TAG, "[SERVICE] tracker_user_id=$trackerUserId")
        Log.d(TAG, "[SERVICE] org_id=$orgId")
        Log.d(TAG, "[SERVICE] jwt_sub=$jwtSub")
        Log.d(TAG, "[QUEUE] pending=$queueLen")

        if (intent?.getStringExtra(EXTRA_ACTION) == ACTION_STOP) {
            stopTrackingExplicitly()
            Log.d("SERVICE_STICKY", "onStartCommand -> START_STICKY (STOP)")
            return START_STICKY
        }

        when (intent?.action) {
            ACTION_UPDATE_TRACKER_SESSION -> {
                val updated = replaceTrackerSessionFromIntent(intent)
                Log.d(TAG, "[SERVICE] ACTION_UPDATE_TRACKER_SESSION updated=$updated")
            }
            ACTION_UPDATE_TRACKER_TOKEN -> {
                val updated = adoptTokenOnlyUpdateFromIntent(intent)
                Log.d(TAG, "[SERVICE] ACTION_UPDATE_TRACKER_TOKEN updated=$updated")
            }
            else -> {
                replaceTrackerSessionFromIntent(intent)
            }
        }

        val trackerEnabled = trackerPrefs.getBoolean(TRACKER_ENABLED_KEY, false)
        preloadRuntimeSessionFromPrefs()
        Log.d(TAG, "[SERVICE] frequency_minutes=${getFrequencyMinutesFromPrefs()} intervalMs=${getTrackingIntervalMs()}")

        if (!trackerEnabled) {
            Log.w(TAG, "[SERVICE] tracker_enabled=false, skipping startup")
            return START_STICKY
        }

        if (runtimeAccessToken.isNullOrBlank() || runtimeTrackerUserId.isNullOrBlank()) {
            Log.w(TAG, "[SERVICE] Missing runtime tracker session, skipping startup")
            return START_STICKY
        }

        promoteToForegroundIfNeeded("onStartCommand")
        processPendingPositions()

        if (locationUpdatesStarted) {
            setTrackerEnabled(true)
            Log.d("SERVICE_STICKY", "onStartCommand -> START_STICKY (locationUpdatesStarted)")
            return START_STICKY
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "[SERVICE] ACCESS_FINE_LOCATION not granted; stopping foreground service safely")
            Log.d("SERVICE_STICKY", "onStartCommand -> START_NOT_STICKY (no permission)")
            stopSelfSafely("missing_location_permission")
            return START_NOT_STICKY
        }

        acquireWakeLockIfNeeded()

        val request = buildTrackingLocationRequest()

        return try {
            fusedLocationClient.requestLocationUpdates(
                request,
                locationCallback,
                Looper.getMainLooper(),
            )
            locationUpdatesStarted = true
            lastLocationUpdateAt = System.currentTimeMillis()
            setTrackerEnabled(true)
            Log.d(TAG, "[LOCATION_REQ] updates started")
            Log.d("SERVICE_STICKY", "onStartCommand -> START_STICKY (updates started)")
            START_STICKY
        } catch (e: SecurityException) {
            Log.e(TAG, "[LOCATION_REQ] requestLocationUpdates security error", e)
            Log.d("SERVICE_STICKY", "onStartCommand -> START_STICKY (security error)")
            START_STICKY
        } catch (e: Exception) {
            Log.e(TAG, "[LOCATION_REQ] requestLocationUpdates failed", e)
            Log.d("SERVICE_STICKY", "onStartCommand -> START_STICKY (exception)")
            START_STICKY
        }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.w(TAG, "[SERVICE] onTaskRemoved -> evaluating self restart")
        try {
            preloadRuntimeSessionFromPrefs()
            val hasPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val hasSession = !runtimeAccessToken.isNullOrBlank() && !runtimeTrackerUserId.isNullOrBlank()
            if (!hasPermission || !hasSession) {
                Log.w(TAG, "[SERVICE] onTaskRemoved restart skipped hasPermission=$hasPermission hasSession=$hasSession")
                super.onTaskRemoved(rootIntent)
                return
            }

            val restartIntent = Intent(applicationContext, ForegroundLocationService::class.java).apply {
                action = ACTION_UPDATE_TRACKER_SESSION
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(applicationContext, restartIntent)
            } else {
                applicationContext.startService(restartIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "[SERVICE] onTaskRemoved restart failed", e)
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(screenReceiver)
        } catch (_: Exception) {
        }
        try {
            fusedLocationClient.removeLocationUpdates(locationCallback)
        } catch (_: Exception) {
        }
        watchdogHandler.removeCallbacks(watchdogRunnable)
        releaseWakeLockIfHeld()
        locationUpdatesStarted = false
        foregroundStarted = false
        running = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun stopSelfSafely(reason: String) {
        Log.w(TAG, "[SERVICE] stopSelfSafely reason=$reason")
        try {
            releaseWakeLockIfHeld()
        } catch (_: Exception) {
        }
        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {
        }
        try {
            stopSelf()
        } catch (t: Throwable) {
            Log.w(TAG, "[SERVICE] stopSelfSafely failed", t)
        }
    }

    private fun preloadRuntimeSessionFromPrefs() {
        val prefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)

        runtimeAccessToken = firstNonEmpty(
            prefs.getString("access_token", null),
            prefs.getString("tracker_access_token", null),
        )?.trim()?.takeIf { it.isNotEmpty() }

        runtimeTrackerUserId = firstNonEmpty(
            prefs.getString("tracker_user_id", null),
            prefs.getString("user_id", null),
            prefs.getString("userId", null),
        )?.trim()?.takeIf { it.isNotEmpty() }

        // MigraciÃ³n defensiva: si llegÃ³ como userId/user_id desde WebViewActivity,
        // dejar tracker_user_id persistido para watchdog/recovery y futuros arranques.
        if (!runtimeTrackerUserId.isNullOrBlank() && prefs.getString("tracker_user_id", null).isNullOrBlank()) {
            prefs.edit()
                .putString("tracker_user_id", runtimeTrackerUserId)
                .putString("user_id", runtimeTrackerUserId)
                .putString("userId", runtimeTrackerUserId)
                .apply()
            Log.i(TAG, "[SESSION] migrated tracker_user_id=${runtimeTrackerUserId?.take(12)}")
        }

        val storedFrequency = prefs.getInt(TRACKER_FREQUENCY_MINUTES_KEY, 0)
        Log.d(TAG, "[SESSION] preload token=${!runtimeAccessToken.isNullOrBlank()} tracker_user_id=${runtimeTrackerUserId?.take(12)} stored_frequency_minutes=$storedFrequency")
    }

    private fun getFrequencyMinutesFromPrefs(): Int {
        val prefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        val fromPrefs = prefs.getInt(TRACKER_FREQUENCY_MINUTES_KEY, 0)
        if (fromPrefs >= 1) return fromPrefs

        val fromJwt = decodeJwtFrequencyMinutes(runtimeAccessToken)
        return if (fromJwt != null && fromJwt >= 1) fromJwt else DEFAULT_FREQUENCY_MINUTES
    }

    private fun getTrackingIntervalMs(): Long {
        val freqMinutes = getFrequencyMinutesFromPrefs()
        return (freqMinutes * 60_000L).coerceAtLeast(MIN_ALLOWED_INTERVAL_MS)
    }

    private fun buildTrackingLocationRequest(): LocationRequest {
        val frequencyMinutes = getFrequencyMinutesFromPrefs()
        val intervalMs = getTrackingIntervalMs()
        val minIntervalMs = minOf(DEFAULT_MIN_UPDATE_INTERVAL_MS, intervalMs)

        Log.d(TAG, "[LOCATION_REQ] frequency_minutes=$frequencyMinutes intervalMs=$intervalMs minIntervalMs=$minIntervalMs")

        return LocationRequest.Builder(intervalMs)
            .setMinUpdateIntervalMillis(minIntervalMs)
            .setMaxUpdateDelayMillis(0L)
            .setMinUpdateDistanceMeters(10f)
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .build()
    }

    private fun maybeRecoverLocationUpdates(now: Long) {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        val trackerEnabled = trackerPrefs.getBoolean(TRACKER_ENABLED_KEY, false)

        if (!trackerEnabled) {
            Log.d(TAG, "[RECOVER] tracker disabled, skipping")
            return
        }

        preloadRuntimeSessionFromPrefs()

        if (runtimeAccessToken.isNullOrBlank() || runtimeTrackerUserId.isNullOrBlank()) {
            Log.w(TAG, "[RECOVER] missing runtime session, cannot recover")
            return
        }

        val staleForMs = now - lastLocationUpdateAt
        if (locationUpdatesStarted && lastLocationUpdateAt > 0L && staleForMs < LOCATION_STALE_MS) {
            Log.d(TAG, "[RECOVER] updates still fresh staleForMs=$staleForMs")
            return
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "[RECOVER] permission missing, cannot recover location updates")
            return
        }

        acquireWakeLockIfNeeded()
        promoteToForegroundIfNeeded("recover")

        if (lastRecoveryAttemptAt > 0L && now - lastRecoveryAttemptAt < LOCATION_RECOVERY_COOLDOWN_MS) {
            Log.d(
                TAG,
                "[RECOVER] cooldown active, skipping re-register now=${now} lastRecoveryAttemptAt=${lastRecoveryAttemptAt}"
            )
            return
        }

        val request = buildTrackingLocationRequest()

        try {
            fusedLocationClient.removeLocationUpdates(locationCallback)
        } catch (_: Exception) {
        }

        lastRecoveryAttemptAt = now

        try {
            fusedLocationClient.requestLocationUpdates(
                request,
                locationCallback,
                Looper.getMainLooper(),
            )
            locationUpdatesStarted = true
            Log.d(
                TAG,
                "[RECOVER] requestLocationUpdates re-registered; waiting for real callback before marking healthy"
            )
        } catch (e: Exception) {
            Log.e(TAG, "[RECOVER] failed to recover location updates", e)
        }
    }

    private fun stopTrackingExplicitly() {
        Log.i(TAG, "[SERVICE] stopTrackingExplicitly")
        try {
            fusedLocationClient.removeLocationUpdates(locationCallback)
        } catch (e: Exception) {
            Log.e(TAG, "[SERVICE] removeLocationUpdates failed", e)
        }

        releaseWakeLockIfHeld()
        locationUpdatesStarted = false
        foregroundStarted = false
        setTrackerEnabled(false)

        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {
        }

        stopSelf()
    }

    private fun setTrackerEnabled(enabled: Boolean) {
        getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(TRACKER_ENABLED_KEY, enabled)
            .apply()

        getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(TRACKER_ENABLED_KEY, enabled)
            .apply()

        Log.d(TAG, "[TRACKER_ENABLED] enabled=$enabled")
    }

    private fun acquireWakeLockIfNeeded() {
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
            wakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "geocercas:tracker_wakelock")?.apply {
                setReferenceCounted(false)
            }
        }
        val lock = wakeLock ?: return
        if (!lock.isHeld) {
            lock.acquire()
            Log.d(TAG, "[WAKELOCK] acquired")
        }
    }

    private fun releaseWakeLockIfHeld() {
        val lock = wakeLock ?: return
        if (lock.isHeld) {
            try {
                lock.release()
                Log.d(TAG, "[WAKELOCK] released")
            } catch (e: Exception) {
                Log.e(TAG, "[WAKELOCK] release failed", e)
            }
        }
    }

    private fun decodeJwtPayload(token: String?): JSONObject? {
        return try {
            if (token.isNullOrBlank()) return null
            val parts = token.split('.')
            if (parts.size != 3) return null
            val payload = parts[1]
                .replace('-', '+')
                .replace('_', '/')
                .let {
                    when (it.length % 4) {
                        2 -> "$it=="
                        3 -> "$it="
                        else -> it
                    }
                }
            val decoded = Base64.decode(payload, Base64.DEFAULT)
            JSONObject(String(decoded, Charsets.UTF_8))
        } catch (_: Exception) {
            null
        }
    }

    private fun logJwtDebug(tag: String, token: String?) {
        val payload = decodeJwtPayload(token)
        val exp = payload?.optLong("exp")
        val iss = payload?.optString("iss")
        val aud = payload?.optString("aud")
        val sub = payload?.optString("sub")
        val nowSec = System.currentTimeMillis() / 1000L
        val expired = if (exp != null && exp > 0) nowSec >= exp else null
        Log.d(tag, "[TOKEN_DEBUG] exists=${!token.isNullOrBlank()} length=${token?.length ?: 0} sub=$sub iss=$iss aud=$aud exp=$exp now=$nowSec expired=$expired")
    }

    private fun getJwtSub(token: String?): String? {
        return decodeJwtPayload(token)?.optString("sub")?.trim()?.takeIf { it.isNotEmpty() }
    }

    private fun firstNonEmpty(vararg values: String?): String? {
        for (value in values) {
            val clean = value?.trim()
            if (!clean.isNullOrEmpty()) return clean
        }
        return null
    }

    private fun isJwtToken(token: String?): Boolean {
        if (token.isNullOrBlank()) return false
        return token.split('.').size == 3 && decodeJwtPayload(token) != null
    }

    private fun clearSessionOnAuthErrorIfSafe(token: String?, reason: String) {
        // Los runtime tokens del flujo tracker pueden ser opacos (no JWT).
        // No borrar una sesiÃ³n opaca por un 401/403 temporal, porque rompe watchdog/recovery.
        if (isJwtToken(token)) {
            clearTrackerSession(reason)
        } else {
            Log.w(TAG, "[TOKEN] auth error for opaque runtime token; keeping session reason=$reason")
        }
    }

    private fun decodeJwtFrequencyMinutes(token: String?): Int? {
        try {
            if (token.isNullOrBlank()) return null
            val parts = token.split(".")
            if (parts.size < 2) return null

            val decoded = Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
            val payload = String(decoded, Charsets.UTF_8)
            val json = JSONObject(payload)
            val value = json.optInt("frequency_minutes", 0)
            return if (value >= 1) value else null
        } catch (e: Exception) {
            Log.w(TAG, "[JWT] decodeJwtFrequencyMinutes failed", e)
            return null
        }
    }

    private fun readPositionQueueLocked(trackerPrefs: SharedPreferences): JSONArray {
        val rawQueue = trackerPrefs.getString(POSITION_QUEUE_KEY, null)
        return try {
            if (rawQueue.isNullOrBlank()) JSONArray() else JSONArray(rawQueue)
        } catch (e: Exception) {
            Log.e(TAG, "[QUEUE] Failed to parse persisted queue, resetting", e)
            JSONArray()
        }
    }

    private fun writePositionQueueLocked(trackerPrefs: SharedPreferences, queue: JSONArray) {
        trackerPrefs.edit().putString(POSITION_QUEUE_KEY, queue.toString()).apply()
    }

    private fun tokenHashPrefix(token: String?): String? {
        val clean = token?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return try {
            MessageDigest.getInstance("SHA-256")
                .digest(clean.toByteArray())
                .joinToString("") { "%02x".format(it) }
                .take(12)
        } catch (_: Exception) {
            null
        }
    }

    private fun loadQueueAuthPauseFromPrefs() {
        val prefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        queueAuthPaused = prefs.getBoolean(QUEUE_AUTH_PAUSED_KEY, false)
        queueAuthPausedTokenHashPrefix = prefs.getString(QUEUE_AUTH_PAUSED_TOKEN_HASH_PREFIX_KEY, null)
    }

    private fun resumeQueueAuth(reason: String) {
        queueAuthPaused = false
        queueAuthPausedTokenHashPrefix = null
        getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(QUEUE_AUTH_PAUSED_KEY, false)
            .remove(QUEUE_AUTH_PAUSED_TOKEN_HASH_PREFIX_KEY)
            .apply()
        Log.i(TAG, "[QUEUE_AUTH] resumed reason=$reason")
    }

    private fun pauseQueueUntilNewSession(token: String?, reason: String) {
        val prefix = tokenHashPrefix(token) ?: "unknown"
        queueAuthPaused = true
        queueAuthPausedTokenHashPrefix = prefix
        getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(QUEUE_AUTH_PAUSED_KEY, true)
            .putString(QUEUE_AUTH_PAUSED_TOKEN_HASH_PREFIX_KEY, prefix)
            .apply()
        Log.e(TAG, "[QUEUE_AUTH] paused until new runtime session reason=$reason token_hash_prefix=$prefix")
    }

    private fun isQueuePausedForToken(token: String?): Boolean {
        loadQueueAuthPauseFromPrefs()
        if (!queueAuthPaused) return false
        val currentPrefix = tokenHashPrefix(token)
        val pausedPrefix = queueAuthPausedTokenHashPrefix
        if (!pausedPrefix.isNullOrBlank() && currentPrefix != pausedPrefix) {
            resumeQueueAuth("runtime_token_changed")
            return false
        }
        Log.w(TAG, "[QUEUE_AUTH] blocked for token_hash_prefix=$currentPrefix waiting_new_session=true")
        return true
    }

    private fun clearPendingQueue(reason: String) {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        synchronized(queueLock) {
            val oldSize = readPositionQueueLocked(trackerPrefs).length()
            trackerPrefs.edit().putString(POSITION_QUEUE_KEY, JSONArray().toString()).apply()
            Log.w(TAG, "[QUEUE] cleared pending queue reason=$reason oldSize=$oldSize")
        }
    }

    private fun buildQueueItem(payload: JSONObject): JSONObject {
        val now = System.currentTimeMillis()
        return JSONObject().apply {
            put("id", "pos_${now}_${System.nanoTime()}")
            put("createdAt", now)
            put("attemptCount", 0)
            put("lastAttemptAt", JSONObject.NULL)
            put("nextAttemptAt", now)
            put("payload", JSONObject(payload.toString()))
        }
    }

    private fun getQueueItemPayload(item: JSONObject): JSONObject? =
        item.optJSONObject("payload")?.let { JSONObject(it.toString()) }

    private fun getLastQueuedPositionPayload(): JSONObject? {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        synchronized(queueLock) {
            val queue = readPositionQueueLocked(trackerPrefs)
            if (queue.length() == 0) return null
            return getQueueItemPayload(queue.optJSONObject(queue.length() - 1) ?: return null)
        }
    }

    private fun getLastSentPositionPayload(): JSONObject? {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        val raw = trackerPrefs.getString(LAST_SENT_POSITION_KEY, null)
        return try {
            if (raw.isNullOrBlank()) null else JSONObject(raw)
        } catch (e: Exception) {
            Log.e(TAG, "[QUEUE] Failed to parse last sent position metadata", e)
            null
        }
    }

    private fun saveLastSentPositionPayload(payload: JSONObject) {
        getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(LAST_SENT_POSITION_KEY, payload.toString())
            .apply()
    }

    private fun getPayloadTimestamp(payload: JSONObject): Long = payload.optLong("timestamp", 0L)

    private fun getPayloadAccuracy(payload: JSONObject): Double? {
        if (!payload.has("accuracy") || payload.isNull("accuracy")) return null
        return payload.optDouble("accuracy").takeIf { !it.isNaN() && it >= 0.0 }
    }

    private fun distanceBetweenMeters(a: JSONObject, b: JSONObject): Float {
        val results = FloatArray(1)
        Location.distanceBetween(a.optDouble("lat"), a.optDouble("lng"), b.optDouble("lat"), b.optDouble("lng"), results)
        return results[0]
    }

    private fun isSignificantlyMoreAccurate(candidate: JSONObject, reference: JSONObject): Boolean {
        val candidateAccuracy = getPayloadAccuracy(candidate) ?: return false
        val referenceAccuracy = getPayloadAccuracy(reference) ?: return false
        return candidateAccuracy <= referenceAccuracy - ACCURACY_IMPROVEMENT_METERS
    }

    private fun shouldSkipAsDuplicate(candidate: JSONObject, reference: JSONObject?, source: String): Boolean {
        if (reference == null) return false
        val candidateTimestamp = getPayloadTimestamp(candidate)
        val referenceTimestamp = getPayloadTimestamp(reference)
        if (candidateTimestamp <= 0L || referenceTimestamp <= 0L) return false
        val ageDiff = kotlin.math.abs(candidateTimestamp - referenceTimestamp)
        if (ageDiff > DEDUPE_WINDOW_MS) return false
        val distance = distanceBetweenMeters(candidate, reference)
        if (distance > DEDUPE_DISTANCE_METERS) return false
        if (isSignificantlyMoreAccurate(candidate, reference)) {
            Log.d(TAG, "[QUEUE] Keeping position despite similarity; accuracy improved vs $source")
            return false
        }
        Log.d(TAG, "[QUEUE] Skipping near-duplicate position from $source distance=$distance ageDiffMs=$ageDiff")
        return true
    }

    private fun computeBackoffMs(attemptCount: Int): Long {
        val exponent = (attemptCount - 1).coerceAtLeast(0)
        val multiplier = 1L shl exponent.coerceAtMost(10)
        return (BASE_BACKOFF_MS * multiplier).coerceAtMost(MAX_BACKOFF_MS)
    }

    private fun enqueuePosition(payload: JSONObject): Int {
        Log.d(TAG, "[ENQUEUE_POSITION] enqueuePosition called, adding position to queue")
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        synchronized(queueLock) {
            var queue = readPositionQueueLocked(trackerPrefs)
            while (queue.length() >= MAX_QUEUE_SIZE) {
                val trimmed = JSONArray()
                for (index in 1 until queue.length()) {
                    trimmed.put(queue.get(index))
                }
                queue = trimmed
            }
            queue.put(buildQueueItem(payload))
            writePositionQueueLocked(trackerPrefs, queue)
            val queueLength = queue.length()
            Log.d(TAG, "[ENQUEUE_POSITION] position added to queue, new queue length: $queueLength")
            return queueLength
        }
    }

    private fun peekQueuedPosition(): JSONObject? {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        synchronized(queueLock) {
            val queue = readPositionQueueLocked(trackerPrefs)
            if (queue.length() == 0) return null
            return queue.optJSONObject(0)?.let { JSONObject(it.toString()) }
        }
    }

    private fun getQueuedPositionNextAttemptAt(item: JSONObject): Long = item.optLong("nextAttemptAt", 0L)

    private fun markQueuedPositionAttemptStart(itemId: String): JSONObject? {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        synchronized(queueLock) {
            val queue = readPositionQueueLocked(trackerPrefs)
            val now = System.currentTimeMillis()
            for (index in 0 until queue.length()) {
                val currentItem = queue.optJSONObject(index) ?: continue
                if (currentItem.optString("id") != itemId) continue
                val attemptCount = currentItem.optInt("attemptCount", 0) + 1
                currentItem.put("attemptCount", attemptCount)
                currentItem.put("lastAttemptAt", now)
                currentItem.put("nextAttemptAt", now)
                queue.put(index, currentItem)
                writePositionQueueLocked(trackerPrefs, queue)
                return JSONObject(currentItem.toString())
            }
            return null
        }
    }

    private fun scheduleQueuedPositionRetry(itemId: String): JSONObject? {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        synchronized(queueLock) {
            val queue = readPositionQueueLocked(trackerPrefs)
            val now = System.currentTimeMillis()
            for (index in 0 until queue.length()) {
                val currentItem = queue.optJSONObject(index) ?: continue
                if (currentItem.optString("id") != itemId) continue
                currentItem.put("nextAttemptAt", now + computeBackoffMs(currentItem.optInt("attemptCount", 0)))
                queue.put(index, currentItem)
                writePositionQueueLocked(trackerPrefs, queue)
                return JSONObject(currentItem.toString())
            }
            return null
        }
    }

    private fun removeQueuedPosition(): Int {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        synchronized(queueLock) {
            val queue = readPositionQueueLocked(trackerPrefs)
            if (queue.length() == 0) return 0
            val nextQueue = JSONArray()
            for (index in 1 until queue.length()) {
                nextQueue.put(queue.get(index))
            }
            writePositionQueueLocked(trackerPrefs, nextQueue)
            return nextQueue.length()
        }
    }

    private fun shouldEnqueuePosition(payload: JSONObject): Boolean {
        val lastQueued = getLastQueuedPositionPayload()
        if (shouldSkipAsDuplicate(payload, lastQueued, "last_pending")) return false
        val lastSent = getLastSentPositionPayload()
        if (shouldSkipAsDuplicate(payload, lastSent, "last_sent_recent")) return false
        return true
    }

    private fun clearTrackerSession(reason: String) {
        Log.e(TAG, "[TOKEN] clearTrackerSession reason=$reason")
        runtimeAccessToken = null
        runtimeTrackerUserId = null

        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        val legacyPrefs = getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)

        trackerPrefs.edit()
            .remove("access_token")
            .remove("tracker_access_token")
            .remove("tracker_user_id")
            .remove("user_id")
            .remove("userId")
            .remove("auth_token")
            .remove("tracker_token")
            .remove("owner_token")
            .remove("session_token")
            .apply()

        legacyPrefs.edit()
            .remove("auth_token")
            .remove("tracker_token")
            .remove("owner_token")
            .remove("session_token")
            .remove("tracker_user_id")
            .remove("user_id")
            .remove("userId")
            .apply()
    }

    private fun validateTrackerTokenCandidate(
        token: String?,
        trackerUserId: String?,
        source: String,
        clearOnFailure: Boolean = false,
    ): TokenCandidate? {
        val cleanToken = token?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val cleanTrackerUserId = trackerUserId?.trim()?.takeIf { it.isNotEmpty() } ?: return null

        val payload = decodeJwtPayload(cleanToken)

        // Runtime tracker tokens pueden ser opacos (por ejemplo hex) y no siempre JWT.
        // Para esos tokens, la validaciÃ³n local correcta es: token presente + tracker_user_id presente.
        // La validaciÃ³n fuerte final ocurre en el backend /api/send-position.
        if (payload == null) {
            Log.d(
                TAG,
                "[TOKEN_VALIDATE] source=$source opaque_runtime_token=true tracker_user_id=${cleanTrackerUserId.take(12)}",
            )
            return TokenCandidate(source, cleanToken, cleanTrackerUserId)
        }

        val jwtSub = payload.optString("sub").trim()
        val jwtExp = payload.optLong("exp", 0L)
        val nowSec = System.currentTimeMillis() / 1000L
        val expired = jwtExp > 0L && nowSec >= jwtExp

        Log.d(
            TAG,
            "[TOKEN_VALIDATE] source=$source jwt_sub=$jwtSub jwt_exp=$jwtExp expired=$expired tracker_user_id=$cleanTrackerUserId",
        )

        if (jwtSub.isEmpty() || jwtSub != cleanTrackerUserId || expired) {
            Log.e(TAG, "[TOKEN_VALIDATE] token_invalid_or_mismatch source=$source")
            if (clearOnFailure) {
                clearTrackerSession("token_invalid_or_mismatch:$source")
            }
            return null
        }

        return TokenCandidate(source, cleanToken, cleanTrackerUserId)
    }

    private fun postQueuedPosition(
        item: JSONObject,
        tokenCandidate: TokenCandidate,
        tryRefreshOnAuthError: Boolean = true,
    ): Boolean {
        val payload = getQueueItemPayload(item) ?: return false
        val orgId = payload.optString("org_id", "")
        val token = tokenCandidate.token
        var conn: HttpURLConnection? = null

        Log.d(
            TAG,
            "[SEND_POSITION_TOKEN] source=${tokenCandidate.source} tracker_user_id=${tokenCandidate.trackerUserId} jwt_sub=${getJwtSub(token)}",
        )

        return try {
            // Log URL and payload
            Log.d(TAG, "SEND_POSITION_URL: $REQUEST_URL")
            Log.d(TAG, "SEND_POSITION_PAYLOAD: ${payload.toString()}")
            logJwtDebug(TAG, token)
            conn = (URL(REQUEST_URL).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
                setRequestProperty("Authorization", "Bearer $token")
                connectTimeout = 15_000
                readTimeout = 15_000
                doOutput = true
            }

            conn.outputStream.use { output ->
                output.write(payload.toString().toByteArray())
                output.flush()
            }

            val responseCode = conn.responseCode
            val responseBody = try {
                val stream = if (responseCode in 200..299) conn.inputStream else conn.errorStream
                if (stream != null) BufferedReader(InputStreamReader(stream)).use { it.readText() } else "(empty body)"
            } catch (readErr: Exception) {
                "(failed to read response body: ${readErr.message})"
            }

            Log.d(TAG, "SEND_POSITION_RESPONSE: HTTP $responseCode body: $responseBody")

            if (responseCode == 401) {
                Log.e(TAG, "SEND_POSITION_ERROR: 401 Unauthorized - invalid token. Body: $responseBody")
                if (responseBody.contains("runtime_session_not_found", ignoreCase = true)) {
                    pauseQueueUntilNewSession(token, "runtime_session_not_found")
                } else {
                    clearSessionOnAuthErrorIfSafe(token, "http_401")
                }
                return false
            }

            if (responseCode == 403) {
                Log.e(TAG, "SEND_POSITION_ERROR: 403 Forbidden - access denied. Body: $responseBody")
                if (responseBody.contains("runtime_session_not_found", ignoreCase = true)) {
                    pauseQueueUntilNewSession(token, "runtime_session_not_found_403")
                } else {
                    clearSessionOnAuthErrorIfSafe(token, "http_403")
                }
                return false
            }

            if (responseCode in 200..299) {
                saveLastSentPositionPayload(payload)
                Log.d(TAG, "send-position response: code=$responseCode org_id=${orgId.ifEmpty { "missing" }} body=$responseBody")
                true
            } else {
                Log.e(TAG, "SEND_POSITION_ERROR: code=$responseCode org_id=${orgId.ifEmpty { "missing" }} body=$responseBody")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "SEND_POSITION_ERROR: exception org_id=${orgId.ifEmpty { "missing" }}", e)
            false
        } finally {
            try {
                conn?.disconnect()
            } catch (_: Exception) {
            }
        }
    }

    private fun processPendingPositions() {
        val queueSize = getPendingQueueSize()
        Log.d(TAG, "[PROCESS_PENDING] processPendingPositions called, queue size: $queueSize")

        synchronized(queueLock) {
            if (queueProcessing) {
                Log.d(TAG, "[PROCESS_PENDING] queue already processing, skipping (return)")
                return
            }
            queueProcessing = true
        }

        Thread {
            try {
                while (true) {
                    val queuedItem = peekQueuedPosition()
                    if (queuedItem == null) {
                        Log.d(TAG, "[PROCESS_PENDING] No pending positions in queue. (return)")
                        break
                    }

                    val tokenCandidate = getAccessTokenCandidate()
                    Log.d(TAG, "[PROCESS_PENDING] Token exists: ${tokenCandidate != null}")
                    if (tokenCandidate == null) {
                        Log.e(TAG, "[TOKEN_QUEUE_RETAINED] missing_or_invalid_tracker_session, keeping queued positions (return)")
                        break
                    }

                    if (isQueuePausedForToken(tokenCandidate.token)) {
                        Log.w(TAG, "[PROCESS_PENDING] queue auth paused, waiting for a new runtime session")
                        break
                    }

                    val now = System.currentTimeMillis()
                    val nextAttemptAt = getQueuedPositionNextAttemptAt(queuedItem)
                    val diffMs = nextAttemptAt - now
                    Log.d(
                        TAG,
                        "[NEXT_ATTEMPT] now=$now next=$nextAttemptAt diffMs=$diffMs bypass=false",
                    )

                    if (nextAttemptAt > now) {
                        Log.d(TAG, "[PROCESS_PENDING] backoff active, not retrying yet")
                        break
                    }

                    val attemptItem = markQueuedPositionAttemptStart(queuedItem.optString("id"))
                    if (attemptItem == null) {
                        Log.d(TAG, "[PROCESS_PENDING] markQueuedPositionAttemptStart returned null (return)")
                        break
                    }

                    Log.d(
                        TAG,
                        "[PROCESS_PENDING] About to send HTTP: url=$REQUEST_URL payload=${getQueueItemPayload(attemptItem)?.toString()} token=true",
                    )

                    val sent = postQueuedPosition(attemptItem, tokenCandidate)
                    Log.d(TAG, "[PROCESS_PENDING] HTTP send finished: sent=$sent")

                    if (!sent) {
                        val updatedItem = scheduleQueuedPositionRetry(queuedItem.optString("id"))
                        Log.w(
                            TAG,
                            "[QUEUE] send failed id=${queuedItem.optString("id")} attemptCount=${updatedItem?.optInt("attemptCount")} nextAttemptAt=${updatedItem?.optLong("nextAttemptAt")}",
                        )
                        Log.d(TAG, "[PROCESS_PENDING] Send failed, breaking (return)")
                        break
                    }

                    val remaining = removeQueuedPosition()
                    Log.d(TAG, "[QUEUE] Sent queued position successfully id=${queuedItem.optString("id")} remaining=$remaining")
                }
            } finally {
                synchronized(queueLock) {
                    queueProcessing = false
                }
                // Do not recursively restart processing here. A failed item may have a backoff
                // or an auth pause; processing resumes on the next location, new session, or service start.
            }
        }.start()
    }

    // Helper to get queue size for logging
    private fun getPendingQueueSize(): Int {
        return try {
            val prefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
            val queueJson = prefs.getString(POSITION_QUEUE_KEY, "[]") ?: "[]"
            val arr = org.json.JSONArray(queueJson)
            arr.length()
        } catch (_: Exception) {
            -1
        }
    }

    private fun sendPositionToBackend(lat: Double, lng: Double, accuracy: Float?) {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        val accessToken = trackerPrefs.getString("access_token", null)?.trim()?.takeIf { it.isNotEmpty() }
        val trackerUserId = trackerPrefs.getString("tracker_user_id", null)?.trim()?.takeIf { it.isNotEmpty() }
        val orgId = trackerPrefs.getString("org_id", null)?.trim()?.takeIf { it.isNotEmpty() }

        Log.d(
            TAG,
            """
            Sending position:
            token=${if (accessToken.isNullOrBlank()) "(null)" else "OK"}
            user_id=$trackerUserId
            org_id=$orgId
            lat=$lat
            lng=$lng
            accuracy=$accuracy
            """.trimIndent(),
        )

        if (accessToken == null || trackerUserId == null) {
            Log.e(
                TAG,
                "[TRACKING_BLOCKED] missing_token_or_user_id_for_tracking (access_token=${accessToken != null}, tracker_user_id=$trackerUserId, org_id=$orgId)",
            )
            return
        }

        val jwtPayload = decodeJwtPayload(accessToken)
        if (jwtPayload != null) {
            val jwtSub = jwtPayload.optString("sub").trim()
            val jwtExp = jwtPayload.optLong("exp", 0L)
            val nowSec = System.currentTimeMillis() / 1000L
            val expired = jwtExp > 0L && nowSec >= jwtExp

            if (jwtSub.isEmpty() || jwtSub != trackerUserId) {
                Log.e(TAG, "[TRACKING_BLOCKED] JWT sub mismatch: jwt_sub=$jwtSub tracker_user_id=$trackerUserId. Clearing session and aborting send.")
                clearTrackerSession("jwt_sub_mismatch")
                return
            }

            if (expired) {
                Log.e(TAG, "[TRACKING_BLOCKED] JWT expired: exp=$jwtExp now=$nowSec. Waiting for runtime renewal.")
                if (trackerPrefs.getString("runtime_refresh_token", null).isNullOrBlank()) return
            }
        } else {
            Log.d(TAG, "[TRACKING_ALLOWED] opaque runtime token with tracker_user_id=$trackerUserId org_id=$orgId")
        }

        val nowIso = java.time.Instant.now().toString()

        val payload = JSONObject().apply {
            put("org_id", orgId)
            put("tracker_user_id", trackerUserId)
            put("user_id", trackerUserId)
            put("lat", lat)
            put("lng", lng)

            if (accuracy != null) put("accuracy", accuracy)

            put("recorded_at", nowIso)
            put("device_recorded_at", nowIso)
            put("timestamp", System.currentTimeMillis())
            put("service_running", true)
            put("source", "tracker-native-android")
        }

        Log.d(TAG, "[SEND_POSITION_PAYLOAD_KEYS] " + payload.keys().asSequence().toList().joinToString(", "))

        if (!payload.has("org_id") || payload.optString("org_id").isNullOrEmpty()) {
            Log.e(TAG, "[SEND_POSITION] org_id missing in payload, aborting send")
            return
        }

        if (isQueuePausedForToken(accessToken)) {
            Log.w(TAG, "[SEND_POSITION] queue paused for current token; not enqueueing until new runtime session")
            return
        }

        if (!shouldEnqueuePosition(payload)) return
        enqueuePosition(payload)
        processPendingPositions()
    }

    private fun getAccessTokenCandidate(): TokenCandidate? {
        if (!RuntimeSessionRenewal.renewIfNeeded(this, REQUEST_URL)) return null
        preloadRuntimeSessionFromPrefs()
        return validateTrackerTokenCandidate(
            token = runtimeAccessToken,
            trackerUserId = runtimeTrackerUserId,
            source = "runtime",
            clearOnFailure = true,
        )
    }

    private fun replaceTrackerSessionFromIntent(intent: Intent?): Boolean {
        try {
            var tokenFromIntent = intent?.getStringExtra(EXTRA_ACCESS_TOKEN)?.trim()?.takeIf { it.isNotEmpty() }
            val trackerUserIdFromIntent = intent?.getStringExtra(EXTRA_TRACKER_USER_ID)?.trim()?.takeIf { it.isNotEmpty() }
            val orgIdFromIntent = intent?.getStringExtra("org_id")?.trim()?.takeIf { it.isNotEmpty() }

            if (tokenFromIntent.isNullOrEmpty() || trackerUserIdFromIntent.isNullOrEmpty()) {
                return false
            }

            if (orgIdFromIntent.isNullOrBlank()) return false
            tokenFromIntent = RuntimeSessionRenewal.adoptIncoming(this, tokenFromIntent, trackerUserIdFromIntent, orgIdFromIntent) ?: return false
            val candidate = validateTrackerTokenCandidate(
                token = tokenFromIntent,
                trackerUserId = trackerUserIdFromIntent,
                source = "intent_update_tracker_session",
                clearOnFailure = false,
            ) ?: run {
                Log.w(TAG, "Rejected invalid incoming session; preserving existing session")
                return false
            }

            val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
            val legacyPrefs = getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
            val oldRuntimeHashPrefix = tokenHashPrefix(runtimeAccessToken ?: trackerPrefs.getString("access_token", null))
            val newRuntimeHashPrefix = tokenHashPrefix(candidate.token)

            runtimeAccessToken = candidate.token
            runtimeTrackerUserId = candidate.trackerUserId
            val frequencyMinutes = decodeJwtFrequencyMinutes(candidate.token)

            val trackerPrefsEditor = trackerPrefs.edit()
                .remove("auth_token")
                .remove("tracker_token")
                .remove("owner_token")
                .remove("session_token")
                .remove("access_token")
                .remove("tracker_access_token")
                .remove("tracker_user_id")
                .remove("user_id")
                .remove("userId")
                .putString("access_token", candidate.token)
                .putString("tracker_access_token", candidate.token)
                .putString("tracker_user_id", candidate.trackerUserId)
                .putString("user_id", candidate.trackerUserId)
                .putString("userId", candidate.trackerUserId)
                .putBoolean("token_replaced", true)
                .putBoolean(TRACKER_ENABLED_KEY, true)
                .putBoolean(BRIDGE_READY_KEY, true)

            if (orgIdFromIntent != null) {
                trackerPrefsEditor.putString("org_id", orgIdFromIntent)
            }

            if (frequencyMinutes != null && frequencyMinutes >= 1) {
                trackerPrefsEditor.putInt(TRACKER_FREQUENCY_MINUTES_KEY, frequencyMinutes)
            }

            trackerPrefsEditor.apply()

            legacyPrefs.edit()
                .remove("auth_token")
                .remove("tracker_token")
                .remove("owner_token")
                .remove("session_token")
                .remove("tracker_user_id")
                .remove("user_id")
                .remove("userId")
                .apply()

            if (!newRuntimeHashPrefix.isNullOrBlank() && newRuntimeHashPrefix != oldRuntimeHashPrefix) {
                clearPendingQueue("new_runtime_session")
                resumeQueueAuth("new_runtime_session")
                trackerPrefs.edit()
                    .putString(LAST_RUNTIME_TOKEN_HASH_PREFIX_KEY, newRuntimeHashPrefix)
                    .apply()
                Log.i(TAG, "[SESSION] runtime token changed old=$oldRuntimeHashPrefix new=$newRuntimeHashPrefix")
            }

            val payload = decodeJwtPayload(candidate.token)
            val jwtSub = payload?.optString("sub")
            val jwtExp = payload?.optLong("exp")
            val fingerprint = try {
                val hash = MessageDigest.getInstance("SHA-256").digest(candidate.token.toByteArray())
                val hex = hash.joinToString("") { "%02x".format(it) }
                if (hex.length >= 8) hex.substring(0, 4) + "..." + hex.takeLast(4) else hex
            } catch (_: Exception) {
                "(fingerprint_error)"
            }

            Log.i(
                TAG,
                "service adopted new tracker session tracker_user_id=${candidate.trackerUserId.take(12)} jwt_sub=${jwtSub?.take(12)} exp=$jwtExp fingerprint=$fingerprint",
            )

            processPendingPositions()
            return true
        } catch (e: Exception) {
            Log.e(TAG, "[TOKEN] Failed to replace tracker session from intent", e)
            return false
        }
    }

    private fun adoptTokenOnlyUpdateFromIntent(intent: Intent?): Boolean {
        val tokenFromIntent = intent?.getStringExtra(EXTRA_ACCESS_TOKEN)?.trim()?.takeIf { it.isNotEmpty() } ?: return false
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        val existingTrackerUserId = trackerPrefs.getString("tracker_user_id", null)?.trim()?.takeIf { it.isNotEmpty() }
            ?: runtimeTrackerUserId

        if (existingTrackerUserId.isNullOrEmpty()) {
            Log.e(TAG, "[TOKEN] token-only update ignored: missing tracker_user_id")
            return false
        }

        val fakeIntent = Intent().apply {
            putExtra(EXTRA_ACCESS_TOKEN, tokenFromIntent)
            putExtra(EXTRA_TRACKER_USER_ID, existingTrackerUserId)
        }
        return replaceTrackerSessionFromIntent(fakeIntent)
    }

    private fun getSavedOrgId(): String? {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        val legacyPrefs = getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
        return trackerPrefs.getString("org_id", null)?.trim()?.takeIf { it.isNotEmpty() }
            ?: legacyPrefs.getString("geocercas_tracker_org_id", null)?.trim()?.takeIf { it.isNotEmpty() }
            ?: legacyPrefs.getString("org_id", null)?.trim()?.takeIf { it.isNotEmpty() }
    }

    private fun isBridgeReady(): Boolean {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        val legacyPrefs = getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
        return trackerPrefs.getBoolean(BRIDGE_READY_KEY, false) || legacyPrefs.getBoolean(BRIDGE_READY_KEY, false)
    }

    private fun isAssignmentResolved(): Boolean {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        val legacyPrefs = getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
        return trackerPrefs.getBoolean(ASSIGNMENT_RESOLVED_KEY, false) || legacyPrefs.getBoolean(ASSIGNMENT_RESOLVED_KEY, false)
    }

    private fun setAssignmentResolved(resolved: Boolean) {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        val legacyPrefs = getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
        trackerPrefs.edit().putBoolean(ASSIGNMENT_RESOLVED_KEY, resolved).apply()
        legacyPrefs.edit().putBoolean(ASSIGNMENT_RESOLVED_KEY, resolved).apply()
    }

    private fun checkActiveAssignment(token: String, orgId: String?): Boolean {
        return try {
            val requestUrl = "https://preview.tugeocercas.com/api/tracker-active-assignment"
            val jsonBody = """{"requested_org_id":"${orgId ?: ""}"}"""
            val requestBody = jsonBody.toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url(requestUrl)
                .addHeader("Authorization", "Bearer $token")
                .addHeader("Content-Type", "application/json")
                .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
                .post(requestBody)
                .build()

            val response = httpClient.newCall(request).execute()
            val code = response.code
            val body = response.body?.string().orEmpty()
            response.close()
            code in 200..299 && body.contains("\"active\":true")
        } catch (e: Exception) {
            Log.e(TAG, "[AUTO-START] Assignment check exception", e)
            false
        }
    }

    private fun buildNotification(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Geocercas activo")
            .setContentText("Tracking en segundo plano")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

    private fun promoteToForegroundIfNeeded(source: String) {
        if (foregroundStarted) return
        try {
            startForeground(NOTIFICATION_ID, buildNotification())
            foregroundStarted = true
            Log.d(TAG, "[SERVICE] startForeground executed from $source")
        } catch (e: Exception) {
            Log.e(TAG, "[SERVICE] startForeground failed from $source", e)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Geocercas Tracking",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Tracking en segundo plano"
        }
        manager.createNotificationChannel(channel)
    }
}

