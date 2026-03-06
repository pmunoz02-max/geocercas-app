import { useState } from "react";

const LS_DISCLOSURE_ACCEPTED = "geocercas_location_disclosure_accepted_v1";

export default function LocationDisclosure({ onAccepted, title, body1, body2, continueLabel }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function requestPermission() {
    if (!("geolocation" in navigator)) {
      throw new Error("Geolocation not available in this device/browser.");
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        (err) => reject(err),
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 20000,
        }
      );
    });
  }

  async function handleContinue() {
    setSubmitting(true);
    setError("");

    try {
      await requestPermission();
      try {
        localStorage.setItem(LS_DISCLOSURE_ACCEPTED, "1");
      } catch {}
      onAccepted?.();
    } catch (err) {
      const msg =
        err?.message ||
        "Location permission was denied or could not be requested on this device.";
      setError(String(msg));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-5 text-slate-100 shadow-2xl">
        <h2 className="text-2xl font-bold text-center">
          {title || "Ubicación en segundo plano"}
        </h2>

        <div className="mt-5 space-y-4 text-sm leading-6 text-slate-200 text-center">
          <p>
            {body1 ||
              "App Geocercas recopila tu ubicación incluso cuando la app está cerrada o el teléfono bloqueado para registrar posiciones y validar entrada y salida de geocercas durante la jornada laboral."}
          </p>

          <p>
            {body2 ||
              "Esta información se utiliza únicamente para fines operativos de la organización y no se comparte con terceros ni se usa para publicidad. Puedes detener el seguimiento revocando el permiso de ubicación o cerrando sesión."}
          </p>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-300">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleContinue}
          disabled={submitting}
          className="mt-6 w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"
        >
          {submitting
            ? "Solicitando permiso..."
            : continueLabel || "Continuar"}
        </button>
      </div>
    </div>
  );
}

export { LS_DISCLOSURE_ACCEPTED };