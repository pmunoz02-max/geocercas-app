// src/components/geocercas/LatLngReadout.jsx
import { useEffect, useState } from "react";


export default function LatLngReadout({ map }) {
const [pos, setPos] = useState(null);


useEffect(() => {
if (!map) return;
function onMove(e) {
const { lat, lng } = e.latlng;
setPos({ lat, lng });
}
map.on("mousemove", onMove);
return () => map.off("mousemove", onMove);
}, [map]);


return (
<div className="pointer-events-none fixed bottom-3 left-3 z-[500] rounded bg-white/90 px-3 py-1 text-xs shadow">
{pos ? `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}` : "—"}
</div>
);
}