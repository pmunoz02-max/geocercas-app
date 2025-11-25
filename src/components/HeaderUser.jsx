// src/components/HeaderUser.jsx
import { useAuth } from "../auth/AuthProvider";
import { useUserProfile } from "../hooks/useUserProfile";

export default function HeaderUser() {
  const { signOut } = useAuth();
  const { profile, loading, err, refresh } = useUserProfile();

  return (
    <header className="w-full border-b bg-white/60 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 py-2 flex items-center justify-between gap-3">
        {/* Marca / título */}
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="font-semibold">App Geocerca</span>
        </div>

        {/* Estado de usuario */}
        <div className="flex items-center gap-3">
          {loading ? (
            <span className="text-sm text-gray-500">Cargando usuario…</span>
          ) : err ? (
            <span className="text-sm text-red-600">Error: {err}</span>
          ) : profile ? (
            <>
              <div className="flex flex-col leading-tight">
                <span className="text-sm">{profile.email}</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full border">
                    Rol: {profile.rol ?? "sin rol"}
                  </span>
                  {profile.org_id && (
                    <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-gray-50 border">
                      Org: {String(profile.org_id).slice(0, 8)}…
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={refresh}
                title="Refrescar perfil"
                className="text-sm border rounded px-3 py-1 hover:bg-gray-50"
              >
                Refrescar
              </button>

              <button
                onClick={signOut}
                className="text-sm border rounded px-3 py-1 hover:bg-gray-50"
              >
                Salir
              </button>
            </>
          ) : (
            <span className="text-sm text-gray-500">No autenticado</span>
          )}
        </div>
      </div>
    </header>
  );
}
