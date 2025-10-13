import { supabase } from "../lib/supabase";

export async function sendLocation(lat, lng) {
  const { data, error } = await supabase.rpc("log_location_and_attendance", {
    p_lat: lat,
    p_lng: lng,
  });
  if (error) throw error;
  return data; // [{ geofence_id, event_kind, ts }] o []
}

import { sendLocation } from "./lib/attendance";

async function handleSend() {
  try {
    const res = await sendLocation(currentLat, currentLng);
    console.log(res);
  } catch (e) {
    console.error(e);
    alert(e.message);
  }
}
