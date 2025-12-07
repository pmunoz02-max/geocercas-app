// src/lib/sendPosition.ts
import { supabaseMobile } from "./supabaseMobile";

export type SendPositionInput = {
  lat: number;
  lng: number;
  accuracy?: number | null;
  timestamp?: number | null;
  /**
   * Para identificar el origen en tracker_logs.source
   * Ejemplos:
   *  - "mobile-native-fg-v2"
   *  - "mobile-native-bg-v2"
   */
  source?: string;
};

const SUPABASE_FUNCTION_URL =
  "https://wpaixkvokdkudymgjoua.supabase.co/functions/v1/send_position";

export async function sendPosition(input: SendPositionInput) {
  try {
    const { data: sessionData } = await supabaseMobile.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      console.warn("[sendPosition] No hay sesión activa, no envío posición.");
      return;
    }

    const payload = {
      lat: input.lat,
      lng: input.lng,
      accuracy: input.accuracy ?? null,
      timestamp: input.timestamp ?? Date.now(),
      user_id: session.user.id,
      // si no mandas nada, por defecto marca origen móvil v2
      source: input.source ?? "mobile-native-v2",
    };

    const res = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        // @ts-ignore - propiedad interna del cliente
        apikey: (supabaseMobile as any).supabaseKey ?? "",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(
        "[sendPosition] Error HTTP:",
        res.status,
        res.statusText,
        text
      );
      return;
    }

    const data = await res.json().catch(() => null);
    console.log("[sendPosition] OK:", data);
  } catch (err) {
    console.error("[sendPosition] Error general:", err);
  }
}
