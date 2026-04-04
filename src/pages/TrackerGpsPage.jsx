import { useEffect } from "react";

export default function TrackerGpsPage() {
  useEffect(() => {
    console.log("[TRACKER_BUILD] 2026-04-04-B");
  }, []);

  return (
    <div style={{fontSize: "40px", color: "red"}}>
      TRACKER OK 2026 FINAL
    </div>
  );
}