// Enforcer universal: /admins solo para root app-level
useEffect(() => {
  if (!user) return;
  if (location.pathname === "/admins" && !isAppRoot) {
    navigate("/inicio", { replace: true });
  }
}, [user, isAppRoot, location.pathname, navigate]);
``` :contentReference[oaicite:0]{index=0}

👉 O sea: aunque seas **OWNER**, si **no eres isAppRoot**, **SIEMPRE** te manda a `/inicio`.  
Por eso el click en ADMINISTRADOR siempre termina en `/inicio`. ✅

Además, `tabs` en `ProtectedShell` agrega `/admins` **solo si isAppRoot**, pero tu `TopTabs` lo inyecta para owner/admin, creando inconsistencia. 

---

# ✅ Solución final (universal): unificar la regla en un solo lugar
Regla correcta según tu requerimiento:
- Mostrar/permitir **Administrador** para: `isAppRoot || role in (owner, admin)`
- Eliminar el enforcer root-only.
- Dejar que el módulo admin exista como `/admins` (route real).

Te devuelvo **ProtectedShell.jsx completo y corregido**, y además ajusto TopTabs para que **NO inyecte admin** (porque ya lo controla el `tabs` del shell). Esto evita duplicados y conflictos.

---

## 1) `src/layouts/ProtectedShell.jsx` — COMPLETO CORREGIDO
Reemplaza TODO por esto:

```jsx
import React, { useEffect, useMemo } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AppHeader from "../components/AppHeader.jsx";
import TopTabs from "../components/TopTabs.jsx";

export default function ProtectedShell() {
  const { loading, user, currentRole, isAppRoot } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const role = String(currentRole || "").toLowerCase().trim();

  // Tracker-only redirect
  useEffect(() => {
    if (!user) return;
    if (role === "tracker" && location.pathname !== "/tracker-gps") {
      navigate("/tracker-gps", { replace: true });
    }
  }, [user, role, location.pathname, navigate]);

  /**
   * ✅ Regla universal para /admins:
   * - ROOT app-level (isAppRoot) ✅
   * - OWNER/ADMIN ✅
   * - otros → /inicio
   */
  useEffect(() => {
    if (!user) return;
    if (location.pathname !== "/admins") return;

    const canEnterAdmins = isAppRoot || role === "owner" || role === "admin";
    if (!canEnterAdmins) {
      navigate("/inicio", { replace: true });
    }
  }, [user, isAppRoot, role, location.pathname, navigate]);

  const tabs = useMemo(() => {
    const base = [
      { path: "/inicio", labelKey: "app.tabs.inicio" },
      { path: "/nueva-geocerca", labelKey: "app.tabs.nuevaGeocerca" },
      { path: "/personal", labelKey: "app.tabs.personal" },
      { path: "/actividades", labelKey: "app.tabs.actividades" },
      { path: "/asignaciones", labelKey: "app.tabs.asignaciones" },
      { path: "/costos", labelKey: "app.tabs.reportes" },
      { path: "/tracker-dashboard", labelKey: "app.tabs.tracker" },
    ];

    if (role === "owner" || role === "admin" || isAppRoot) {
      base.push({ path: "/invitar-tracker", labelKey: "app.tabs.invitarTracker" });
      base.push({ path: "/admins", labelKey: "app.tabs.admins" });
    }

    return base;
  }, [role, isAppRoot]);

  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center text-slate-600">
        Cargando…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (role === "tracker" && location.pathname !== "/tracker-gps") return null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <AppHeader />
      <div className="border-b border-slate-200 bg-slate-50/80 backdrop-blur">
        <TopTabs tabs={tabs} />
      </div>
      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
