// --- CANONICAL TRACKER RUNTIME TOKEN RULE ---
// ÚNICA fuente válida de token para tracking:
//   - runtimeAccessToken
//   - tracker_prefs.access_token
// PROHIBIDO fallback a:
//   - auth_token
//   - owner_token
//   - legacy tokens
// Antes de cada envío, el token debe pertenecer al tracker_user_id esperado y reemplazarse de forma fuerte si llega un bootstrap nuevo.
// Esto está documentado y es obligatorio.

package com.fenice.geocercas

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

        const val ACTION_UPDATE_TRACKER_SESSION = "com.fenice.geocercas.ACTION_UPDATE_TRACKER_SESSION"
        const val ACTION_UPDATE_TRACKER_TOKEN = "UPDATE_TRACKER_TOKEN"

        private const val REQUEST_URL = "https://preview.tugeocercas.com/api/send-position"
        private const val TRACKER_PREFS = "tracker_prefs"
        private const val LEGACY_PREFS = "TrackingServicePrefs"
        private const val TRACKER_ENABLED_KEY = "tracker_enabled"
        private const val POSITION_QUEUE_KEY = "pending_position_queue"
        private const val LAST_SENT_POSITION_KEY = "last_sent_position"
        private const val MAX_QUEUE_SIZE = 500
        private const val BASE_BACKOFF_MS = 5_000L
        private const val MAX_BACKOFF_MS = 15 * 60 * 1000L
        private const val DEDUPE_DISTANCE_METERS = 12f
        private const val DEDUPE_WINDOW_MS = 15_000L
        private const val ACCURACY_IMPROVEMENT_METERS = 5f
        private const val BRIDGE_READY_KEY = "tracker_bridge_ready"
        private const val ASSIGNMENT_RESOLVED_KEY = "tracker_assignment_resolved"
        private const val LOCATION_STALE_MS = 60_000L

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

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                lastLocationUpdateAt = System.currentTimeMillis()
                for (location in locationResult.locations) {
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
            Log.w(TAG, "[SERVICE] ACCESS_FINE_LOCATION not granted")
            Log.d("SERVICE_STICKY", "onStartCommand -> START_STICKY (no permission)")
            return START_STICKY
        }

        acquireWakeLockIfNeeded()

        val request = LocationRequest.Builder(10_000L)
            .setMinUpdateIntervalMillis(5_000L)
            .setMaxUpdateDelayMillis(0L)
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .build()

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
        Log.w(TAG, "[SERVICE] onTaskRemoved -> requesting self restart")
        try {
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

    private fun preloadRuntimeSessionFromPrefs() {
        val prefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        runtimeAccessToken = prefs.getString("access_token", null)?.trim()?.takeIf { it.isNotEmpty() }
        runtimeTrackerUserId = prefs.getString("tracker_user_id", null)?.trim()?.takeIf { it.isNotEmpty() }
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

        val request = LocationRequest.Builder(10_000L)
            .setMinUpdateIntervalMillis(5_000L)
            .setMaxUpdateDelayMillis(0L)
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .build()

        try {
            fusedLocationClient.removeLocationUpdates(locationCallback)
        } catch (_: Exception) {
        }

        try {
            fusedLocationClient.requestLocationUpdates(
                request,
                locationCallback,
                Looper.getMainLooper(),
            )
            lastLocationUpdateAt = now
            locationUpdatesStarted = true
            Log.d(TAG, "[RECOVER] location updates recovered")
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
            return queue.length()
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
            .remove("tracker_user_id")
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
        val jwtSub = payload?.optString("sub")?.trim()
        val jwtExp = payload?.optLong("exp")
        val nowSec = System.currentTimeMillis() / 1000L
        val expired = if (jwtExp != null && jwtExp > 0) nowSec >= jwtExp else true

        Log.d(
            TAG,
            "[TOKEN_VALIDATE] source=$source jwt_sub=$jwtSub jwt_exp=$jwtExp expired=$expired tracker_user_id=$cleanTrackerUserId",
        )

        if (jwtSub.isNullOrEmpty() || jwtSub != cleanTrackerUserId || expired) {
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

            if (responseCode == 403 && tryRefreshOnAuthError) {
                clearTrackerSession("http_403")
                return false
            }

            if (responseCode in 200..299) {
                saveLastSentPositionPayload(payload)
                Log.d(TAG, "send-position response: code=$responseCode org_id=${orgId.ifEmpty { "missing" }} body=$responseBody")
                true
            } else {
                Log.e(TAG, "send-position response: code=$responseCode org_id=${orgId.ifEmpty { "missing" }} body=$responseBody")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "send-position exception: org_id=${orgId.ifEmpty { "missing" }}", e)
            false
        } finally {
            try {
                conn?.disconnect()
            } catch (_: Exception) {
            }
        }
    }

    private fun processPendingPositions() {
        synchronized(queueLock) {
            if (queueProcessing) return
            queueProcessing = true
        }

        Thread {
            try {
                while (true) {
                    val queuedItem = peekQueuedPosition() ?: break
                    if (getQueuedPositionNextAttemptAt(queuedItem) > System.currentTimeMillis()) break

                    val tokenCandidate = getAccessTokenCandidate()
                    if (tokenCandidate == null) {
                        Log.e(TAG, "[TOKEN] missing_or_invalid_tracker_session, keeping queued positions")
                        break
                    }

                    val attemptItem = markQueuedPositionAttemptStart(queuedItem.optString("id")) ?: break
                    val sent = postQueuedPosition(attemptItem, tokenCandidate)
                    if (!sent) {
                        val updatedItem = scheduleQueuedPositionRetry(queuedItem.optString("id"))
                        Log.w(
                            TAG,
                            "[QUEUE] send failed id=${queuedItem.optString("id")} attemptCount=${updatedItem?.optInt("attemptCount")} nextAttemptAt=${updatedItem?.optLong("nextAttemptAt")}",
                        )
                        break
                    }

                    val remaining = removeQueuedPosition()
                    Log.d(TAG, "[QUEUE] Sent queued position successfully id=${queuedItem.optString("id")} remaining=$remaining")
                }
            } finally {
                synchronized(queueLock) {
                    queueProcessing = false
                }
                if (peekQueuedPosition() != null) processPendingPositions()
            }
        }.start()
    }

    private fun sendPositionToBackend(lat: Double, lng: Double, accuracy: Float?) {
        val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
        val accessToken = trackerPrefs.getString("access_token", null)?.trim()?.takeIf { it.isNotEmpty() }
        val trackerUserId = trackerPrefs.getString("tracker_user_id", null)?.trim()?.takeIf { it.isNotEmpty() }
        val orgId = trackerPrefs.getString("org_id", null)?.trim()?.takeIf { it.isNotEmpty() }

        val jwtPayload = decodeJwtPayload(accessToken)
        val jwtSub = jwtPayload?.optString("sub")?.trim()
        val jwtExp = jwtPayload?.optLong("exp", 0L) ?: 0L
        val nowSec = System.currentTimeMillis() / 1000L
        val expired = jwtExp <= 0L || nowSec >= jwtExp

        if (accessToken == null || trackerUserId == null) {
            Log.e(
                TAG,
                "[TRACKING_BLOCKED] missing_token_or_user_id_for_tracking (access_token=${accessToken != null}, tracker_user_id=$trackerUserId, org_id=$orgId)",
            )
            return
        }

        if (jwtSub.isNullOrEmpty() || jwtSub != trackerUserId) {
            Log.e(TAG, "[TRACKING_BLOCKED] JWT sub mismatch: jwt_sub=$jwtSub tracker_user_id=$trackerUserId. Clearing session and aborting send.")
            clearTrackerSession("jwt_sub_mismatch")
            return
        }

        if (expired) {
            Log.e(TAG, "[TRACKING_BLOCKED] JWT expired: exp=$jwtExp now=$nowSec. Clearing session and aborting send.")
            clearTrackerSession("jwt_expired")
            return
        }

        val payload = JSONObject().apply {
            put("org_id", orgId)
            put("lat", lat)
            put("lng", lng)
            if (accuracy != null) put("accuracy", accuracy)
            put("timestamp", System.currentTimeMillis())
            put("service_running", true)
            put("source", "tracker-native-android")
        }

        Log.d(TAG, "[SEND_POSITION_PAYLOAD_KEYS] " + payload.keys().asSequence().toList().joinToString(", "))

        if (!payload.has("org_id") || payload.optString("org_id").isNullOrEmpty()) {
            Log.e(TAG, "[SEND_POSITION] org_id missing in payload, aborting send")
            return
        }

        if (!shouldEnqueuePosition(payload)) return
        enqueuePosition(payload)
        processPendingPositions()
    }

    private fun getAccessTokenCandidate(): TokenCandidate? {
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
            val tokenFromIntent = intent?.getStringExtra(EXTRA_ACCESS_TOKEN)?.trim()?.takeIf { it.isNotEmpty() }
            val trackerUserIdFromIntent = intent?.getStringExtra(EXTRA_TRACKER_USER_ID)?.trim()?.takeIf { it.isNotEmpty() }
            val orgIdFromIntent = intent?.getStringExtra("org_id")?.trim()?.takeIf { it.isNotEmpty() }

            if (tokenFromIntent.isNullOrEmpty() || trackerUserIdFromIntent.isNullOrEmpty()) {
                return false
            }

            val candidate = validateTrackerTokenCandidate(
                token = tokenFromIntent,
                trackerUserId = trackerUserIdFromIntent,
                source = "intent_update_tracker_session",
                clearOnFailure = false,
            ) ?: run {
                clearTrackerSession("invalid_intent_update_tracker_session")
                return false
            }

            val trackerPrefs = getSharedPreferences(TRACKER_PREFS, Context.MODE_PRIVATE)
            val legacyPrefs = getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)

            runtimeAccessToken = candidate.token
            runtimeTrackerUserId = candidate.trackerUserId

            val trackerPrefsEditor = trackerPrefs.edit()
                .remove("auth_token")
                .remove("tracker_token")
                .remove("owner_token")
                .remove("session_token")
                .remove("access_token")
                .remove("tracker_user_id")
                .putString("access_token", candidate.token)
                .putString("tracker_user_id", candidate.trackerUserId)
                .putBoolean("token_replaced", true)

            if (orgIdFromIntent != null) {
                trackerPrefsEditor.putString("org_id", orgIdFromIntent)
            }

            trackerPrefsEditor.apply()

            legacyPrefs.edit()
                .remove("auth_token")
                .remove("tracker_token")
                .remove("owner_token")
                .remove("session_token")
                .remove("tracker_user_id")
                .apply()

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