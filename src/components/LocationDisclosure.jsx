import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

const LS_DISCLOSURE_ACCEPTED = "geocercas_location_disclosure_accepted_v1";

export default function LocationDisclosure({ onAccepted, title, body1, body2, continueLabel }) {
  const { t } = useTranslation();
  const tr = useCallback((key, fallback, options = {}) => t(key, { defaultValue: fallback, ...options }), [t]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function requestPermission() {
    if (!("geolocation" in navigator)) {
      throw new Error(tr("locationDisclosure.errors.unavailable", "Geolocation is not available on this device/browser."));
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
        tr(
          "locationDisclosure.errors.permissionDenied",
          "Location permission was denied or could not be requested on this device."
        );
      setError(String(msg));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-5 text-slate-100 shadow-2xl">
        <h2 className="text-2xl font-bold text-center">
          {title || tr("trackerGps.disclosure.title", "Background location")}
        </h2>

        <div className="mt-5 space-y-4 text-sm leading-6 text-slate-200 text-center">
          <p>
            {body1 ||
              tr(
                "trackerGps.disclosure.body1",
                "App Geocercas collects your location even when the app is closed or the phone is locked in order to record positions and validate geofence entry and exit during the workday."
              )}
          </p>

          <p>
            {body2 ||
              tr(
                "trackerGps.disclosure.body2",
                "This information is used only for the organization's operational purposes and is not shared with third parties or used for advertising. You can stop tracking by revoking location permission or signing out."
              )}
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
            ? tr("locationDisclosure.actions.requesting", "Requesting permission...")
            : continueLabel || tr("trackerGps.disclosure.continue", "Continue")}
        </button>
      </div>
    </div>
  );
}

export { LS_DISCLOSURE_ACCEPTED };
