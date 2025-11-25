// src/lib/sendToEdge.ts
const FUNC_URL = import.meta.env.VITE_EDGE_SEND_POSITION as string;

export type SendPosInput = {
  user_id: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
};

export async function sendToEdge({ user_id, lat, lng, accuracy = null }: SendPosInput) {
  if (!FUNC_URL) throw new Error("Falta VITE_EDGE_SEND_POSITION en .env.local");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Si activas Verify JWT en la Edge Function, descomenta la línea de abajo
  // headers["Authorization"] = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`;

  const res = await fetch(FUNC_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id, lat, lng, accuracy }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Edge ${res.status}: ${txt}`);
  }
  return res.json(); // { ok: true }
}
