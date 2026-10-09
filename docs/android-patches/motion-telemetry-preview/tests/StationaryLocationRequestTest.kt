package com.fenice.geofieldgps

import android.content.Context
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.Priority
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE, sdk = [28])
class StationaryLocationRequestTest {
    private fun request(minutes: Int): LocationRequest {
        val service = Robolectric.buildService(ForegroundLocationService::class.java).get()
        service.getSharedPreferences("tracker_prefs", Context.MODE_PRIVATE)
            .edit().putInt("frequency_minutes", minutes).commit()
        return service.javaClass.getDeclaredMethod("buildTrackingLocationRequest")
            .apply { isAccessible = true }.invoke(service) as LocationRequest
    }
    @Test fun stationaryCallbacksKeepOneMinuteFrequencyAndHighAccuracy() {
        val request = request(1)
        assertEquals(0f, request.minUpdateDistanceMeters, 0f)
        assertEquals(60_000L, request.intervalMillis)
        assertEquals(5_000L, request.minUpdateIntervalMillis)
        assertEquals(Priority.PRIORITY_HIGH_ACCURACY, request.priority)
    }
    @Test fun customFrequencyIsPreservedWithoutMovementRequirement() {
        val request = request(5)
        assertEquals(300_000L, request.intervalMillis)
        assertEquals(0f, request.minUpdateDistanceMeters, 0f)
    }
    @Test fun stationaryDuplicatesAreSkippedButLaterHeartbeatIsKept() {
        val service = ForegroundLocationService()
        val method = service.javaClass.getDeclaredMethod("shouldSkipAsDuplicate",
            JSONObject::class.java, JSONObject::class.java, String::class.java)
            .apply { isAccessible = true }
        fun position(time: Long, accuracy: Double = 10.0) = JSONObject()
            .put("lat", -0.07).put("lng", -78.4).put("timestamp", time).put("accuracy", accuracy)
        val reference = position(100_000L)
        assertTrue(method.invoke(service, position(105_000L), reference, "test") as Boolean)
        assertFalse(method.invoke(service, position(160_000L), reference, "test") as Boolean)
        assertFalse(method.invoke(service, position(105_000L, 4.0), reference, "test") as Boolean)
    }
}