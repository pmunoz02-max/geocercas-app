// src/components/AppHeader.jsx
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AppHeader() {
  const { user, profile, currentRole, signOut } = useAuth();

  // Normalizamos el rol
  const role = (currentRole || profile?.role || "").toLowerCase();
  const displayName = profile?.full_name ?? user?.email ?? "";

  return (
    <header className="w-full flex items-center justify-between px-4 py-2 bg-white shadow">
      <h1 className="font-semibold">App Geocercas</h1>

      {user ? (
        <div className="flex items-center gap-3">
          {/* Información del usuario */}
          <div className="text-sm text-gray-600">
            {displayName} · {role || "user"}
          </div>

          {/* BOTÓN ADMINISTRADORES — visible solo para OWNER */}
          {role === "owner" && (
            <Link
              to="/admins"
              className="px-3 py-1 rounded bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition"
            >
              Admins
            </Link>
          )}

          {/* Botón Salir */}
          <button
            onClick={signOut}
            className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
          >
            Salir
          </button>
        </div>
      ) : null}
    </header>
  );
}
