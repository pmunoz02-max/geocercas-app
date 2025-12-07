// src/lib/sendPosition.ts
// Envia la posición actual a la Edge Function `send_position` de Supabase

import { supabase } from "./supabase";

type SendPositionInput = {
  lat: number;
  lng: number;
  accuracy?: number | null;
  timestamp?: number | null;
};

// ✅ URL fija de tu Edge Function en Supabase
const SUPABASE_FUNCTION_URL =
  "https://wpaixkvokdkudymgjoua.supabase.co/functions/v1/send_position";

export async function sendPosition(input: SendPositionInput) {
  try {
    // 1) Recuperar la sesión actual del usuario en la app nativa
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) {
      console.error("[sendPosition] Error obteniendo sesión:", sessionError);
      return;
    }

    const session = sessionData?.session;
    if (!session?.access_token) {
      console.warn(
        "[sendPosition] No hay sesión de usuario: debes estar logueado para enviar posiciones."
      );
      return;
    }

    const accessToken = session.access_token;

    // 2) Preparar payload para la Edge Function
    const nowIso = new Date().toISOString();

    const payload = {
      lat: input.lat,
      lng: input.lng,
      accuracy:
        typeof input.accuracy === "number" ? input.accuracy : undefined,
      at: input.timestamp
        ? new Date(input.timestamp).toISOString()
        : nowIso,
      source: "mobile-native-fg-v2",
    };

    console.log("[sendPosition] Enviando posición:", payload);

    // 3) Llamar a la Edge Function con fetch
    const res = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 👇 IMPORTANTE: token de USUARIO, NO la anon key
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text(); // leemos siempre el cuerpo como texto

    if (!res.ok) {
      console.error(
        "[sendPosition] Error HTTP:",
        res.status,
        res.statusText,
        text
      );
      return;
    }

    // Intentamos parsear JSON (si la función devuelve JSON)
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Si no es JSON, no pasa nada, mostramos el texto bruto
      data = text;
    }

    console.log("[sendPosition] OK:", data);
  } catch (err) {
    console.error("[sendPosition] Error general:", err);
  }
}
