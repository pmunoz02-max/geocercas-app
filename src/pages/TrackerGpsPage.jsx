import { useEffect } from "react";

export default function TrackerGpsPage() {
  useEffect(() => {
    console.log("[TRACKER_BUILD] 2026-04-04-C");
  }, []);

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;
    let timerId = null;

    const tryStart = () => {
      if (cancelled) return;

      attempts += 1;

      const hasBridge =
        typeof window !== "undefined" &&
        window.Android &&
        typeof window.Android.startTracking === "function";

      console.log("[TRACKER_AUTOSTART] attempt=", attempts, "hasBridge=", hasBridge);

      if (hasBridge) {
        console.log("[TRACKER_AUTOSTART] AUTO START TRACKING OK");
        try {
          window.Android.startTracking();
        } catch (error) {
          console.error("[TRACKER_AUTOSTART] startTracking failed", error);
        }
        return;
      }

      if (attempts < 10) {
        timerId = window.setTimeout(tryStart, 500);
      } else {
        console.log("[TRACKER_AUTOSTART] AUTO START TRACKING FAILED");
      }
    };

    tryStart();

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  return (
    <div style={{ fontSize: "40px", color: "red" }}>
      TRACKER OK 2026 FINAL
    </div>
  );
}