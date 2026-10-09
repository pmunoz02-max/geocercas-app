package com.fenice.geofieldgps

import org.junit.Assert.*
import org.junit.Test

class LocationRecoveryTimeoutTest {
    @Test fun oneMinuteUpdatesAllowMissedFixAndSchedulingDelay() {
        val timeout = locationRecoveryTimeoutMs(60_000L)
        assertEquals(150_000L, timeout)
        assertTrue(60_000L < timeout)
        assertTrue(120_000L < timeout)
        assertFalse(150_000L < timeout)
    }
    @Test fun fiveMinuteUpdatesAreNotRecoveredAfterOneMinute() {
        val timeout = locationRecoveryTimeoutMs(300_000L)
        assertEquals(630_000L, timeout)
        assertTrue(300_000L < timeout)
        assertTrue(600_000L < timeout)
    }
    @Test fun invalidIntervalUsesMinimumSupportedFrequency() {
        for (interval in listOf(-1L, 0L, 5_000L)) {
            assertEquals(150_000L, locationRecoveryTimeoutMs(interval))
        }
    }
    @Test fun largestPreferenceValueDoesNotOverflow() {
        val interval = Int.MAX_VALUE.toLong() * 60_000L
        assertTrue(locationRecoveryTimeoutMs(interval) > interval)
    }
}