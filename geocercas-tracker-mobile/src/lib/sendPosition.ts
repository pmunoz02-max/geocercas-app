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

const FUNCTION_NAME = "send_position";

export async function sendPosition(input: SendPositionInput): Promise<void> {
  try {
    console.log("[sendPosition] llamado con:", input);

    // 1) Obtener sesión actual
    const { data: sessionData, error: sessionError } =
      await supabaseMobile.auth.getSession();

    if (sessionError) {
      console.error("[sendPosition] Error obteniendo sesión:", sessionError);
      return;
    }

    const session = sessionData.session;
    console.log(
      "[sendPosition] session:",
      session ? session.user.id : "SIN SESIÓN"
    );

    if (!session) {
      console.warn(
        "[sendPosition] No hay sesión activa, NO envío posición (modo prueba)."
      );
      return;
    }

    // 2) Armar payload
    const payload = {
      lat: input.lat,
      lng: input.lng,
      accuracy: input.accuracy ?? null,
      timestamp: input.timestamp ?? Date.now(),
      user_id: session.user.id,
      source: input.source ?? "mobile-native-fg-v2",
    };

    console.log("[sendPosition] payload a enviar:", payload);

    // 3) Invocar función edge
    const { data, error } = await supabaseMobile.functions.invoke(
      FUNCTION_NAME,
      {
        body: payload,
      }
    );

    if (error) {
      console.error(
        "[sendPosition] Error al invocar send_position:",
        error
      );
      return;
    }

    console.log("[sendPosition] OK, respuesta función:", data);
  } catch (err) {
    console.error("[sendPosition] Error general:", err);
  }
}
