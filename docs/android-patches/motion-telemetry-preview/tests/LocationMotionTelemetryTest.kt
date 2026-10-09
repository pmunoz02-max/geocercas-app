package com.fenice.geofieldgps

import android.location.Location
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE, sdk = [28])
class LocationMotionTelemetryTest {
    private fun payload(location: Location): JSONObject = JSONObject().apply {
        put("lat", -0.07); put("lng", -78.4); put("accuracy", 4.7)
        put("org_id", "org"); put("user_id", "user"); put("source", "tracker-native-android")
        writeLocationMotionTelemetry(this, location)
    }

    @Test fun absentMotionIsExplicitJsonNull() {
        val location = Location("gps")
        assertFalse(location.hasSpeed()); assertFalse(location.hasBearing())
        val result = payload(location)
        assertTrue(result.has("speed")); assertTrue(result.isNull("speed"))
        assertTrue(result.has("heading")); assertTrue(result.isNull("heading"))
    }
    @Test fun availableMotionKeepsUnitsAndDecimals() {
        val result = payload(Location("gps").apply { speed = 2.75f; bearing = 182.5f })
        assertEquals(2.75, result.getDouble("speed"), 0.0)
        assertEquals(182.5, result.getDouble("heading"), 0.0)
        assertEquals(4.7, result.getDouble("accuracy"), 0.0)
    }
    @Test fun zeroIsAvailableRatherThanNull() {
        val result = payload(Location("gps").apply { speed = 0f; bearing = 0f })
        assertFalse(result.isNull("speed")); assertFalse(result.isNull("heading"))
        assertEquals(0.0, result.getDouble("speed"), 0.0)
        assertEquals(0.0, result.getDouble("heading"), 0.0)
    }
    @Test fun speedCanBeAvailableWithoutBearing() {
        val result = payload(Location("gps").apply { speed = 3f })
        assertEquals(3.0, result.getDouble("speed"), 0.0); assertTrue(result.isNull("heading"))
    }
    @Test fun bearingCanBeAvailableWithoutSpeed() {
        val result = payload(Location("gps").apply { bearing = 359.5f })
        assertEquals(359.5, result.getDouble("heading"), 0.0); assertTrue(result.isNull("speed"))
    }
    @Test fun removedFieldsDoNotBecomeZero() {
        val location = Location("gps").apply { speed = 4f; bearing = 90f; removeSpeed(); removeBearing() }
        val result = payload(location)
        assertTrue(result.isNull("speed")); assertTrue(result.isNull("heading"))
    }
    @Test fun invalidSpeedIsNullAndCannotBreakJson() {
        for (value in listOf(-1f, Float.NaN, Float.POSITIVE_INFINITY)) {
            assertTrue(payload(Location("gps").apply { speed = value }).isNull("speed"))
        }
    }
    private fun throughQueue(original: JSONObject): JSONObject {
        val service = ForegroundLocationService()
        val build = service.javaClass.getDeclaredMethod("buildQueueItem", JSONObject::class.java).apply { isAccessible = true }
        val read = service.javaClass.getDeclaredMethod("getQueueItemPayload", JSONObject::class.java).apply { isAccessible = true }
        val item = build.invoke(service, original) as JSONObject
        val restoredItem = JSONObject(item.toString())
        return read.invoke(service, restoredItem) as JSONObject
    }
    @Test fun offlineQueuePreservesMotionAndExistingPayload() {
        val original = payload(Location("gps").apply { speed = 1.5f; bearing = 270f })
        original.put("recorded_at", "2026-10-09T15:00:00Z")
        val restored = throughQueue(original)
        for (key in original.keys()) {
            val value = original.get(key)
            if (value is Number) assertEquals(value.toDouble(), restored.getDouble(key), 0.0)
            else assertEquals(value, restored.get(key))
        }
        assertEquals(1.5, restored.getDouble("speed"), 0.0)
        assertEquals(270.0, restored.getDouble("heading"), 0.0)
    }
    @Test fun offlineQueuePreservesExplicitNull() {
        val restored = throughQueue(payload(Location("gps")))
        assertTrue(restored.has("speed")); assertTrue(restored.isNull("speed"))
        assertTrue(restored.has("heading")); assertTrue(restored.isNull("heading"))
    }
    @Test fun offlineQueueKeepsOldItemsWithoutMotionCompatible() {
        val original = JSONObject().put("lat", 0).put("lng", 0).put("accuracy", 5)
        val restored = throughQueue(original)
        assertFalse(restored.has("speed")); assertFalse(restored.has("heading"))
        assertEquals(original.toString(), restored.toString())
    }
}
