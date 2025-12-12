import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";

/**
 * VideoDemoPage
 * - Página protegida (la protección la hace App.jsx con AuthGuard + Shell).
 * - Embed por defecto via URL (YouTube/Vimeo/Drive/etc).
 * - Universal: permite cambiar el origen sin tocar el componente,
 *   solo cambiando VITE_HELP_VIDEO_URL en Vercel/.env.
 */

export default function VideoDemoPage() {
  const navigate = useNavigate();

  const videoUrl = useMemo(() => {
    // Define esto en Vercel / .env.local:
    // VITE_HELP_VIDEO_URL="https://www.youtube.com/embed/XXXXXXXXXXX"
    // o Vimeo: https://player.vimeo.com/video/XXXXXXXX
    // o cualquier embed permitido.
    const envUrl = (import.meta.env.VITE_HELP_VIDEO_URL || "").trim();

    // Fallback seguro (no rompe build). Si no hay URL, se mostrará un aviso.
    return envUrl || "";
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">
            Centro de Ayuda / Video demo
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            Video demo
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Una vista rápida del flujo principal: geocercas, personal, tracker y
            reportes.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Volver
          </button>

          <button
            type="button"
            onClick={() => navigate("/inicio")}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Ir a Inicio
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        {!videoUrl ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm font-semibold text-amber-900">
              Video no configurado todavía
            </div>
            <p className="mt-1 text-sm text-amber-800">
              Para habilitar el video, define la variable{" "}
              <span className="font-mono">VITE_HELP_VIDEO_URL</span> en Vercel
              (Environment Variables) o en tu{" "}
              <span className="font-mono">.env.local</span>.
            </p>
            <ul className="mt-3 list-disc pl-5 text-sm text-amber-800">
              <li>
                YouTube (embed):{" "}
                <span className="font-mono">
                  https://www.youtube.com/embed/ID
                </span>
              </li>
              <li>
                Vimeo:{" "}
                <span className="font-mono">
                  https://player.vimeo.com/video/ID
                </span>
              </li>
            </ul>
          </div>
        ) : (
          <div>
            <div className="mb-3 text-sm font-medium text-slate-800">
              Reproducción
            </div>

            {/* Responsive 16:9 */}
            <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-sm">
              <div className="pb-[56.25%]" />
              <iframe
                title="App Geocercas - Video demo"
                src={videoUrl}
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">
                Tip (monetización)
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Puedes tener 2 videos: uno público (básico) y otro PRO (avanzado)
                cambiando la URL por plan. Lo dejamos listo para eso con una
                sola variable de entorno por entorno/plan.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
