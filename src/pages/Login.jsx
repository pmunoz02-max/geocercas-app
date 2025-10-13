// src/pages/Login.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * Pantalla de ingreso para:
 *  - Owner
 *  - Administrador
 *  - Tracker
 *
 * Nota:
 *  - Reemplaza fakeSignIn por tu provider real de autenticación.
 *  - Ajusta las rutas de destino si tu router usa otras.
 */

const APP_TITLE = "APP DE CONTROL DE PERSONAL CON GEOCERCAS";

const ROLES = [
  { key: "owner", label: "Owner", hint: "Control total de la app" },
  { key: "admin", label: "Administrador", hint: "Gestión de equipos y geocercas" },
  { key: "tracker", label: "Tracker", hint: "Marcación y ubicación" },
];

// Simulación de autenticación (reemplazar por tu backend)
async function fakeSignIn({ email, password, role }) {
  // Simula latencia
  await new Promise((r) => setTimeout(r, 500));

  // Validaciones simples
  if (!email || !password) {
    const err = new Error("Completa email y contraseña.");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  // Demo: cualquier email/clave >= 6 pasa
  if (password.length < 6) {
    const err = new Error("La contraseña debe tener al menos 6 caracteres.");
    err.code = "WEAK_PASSWORD";
    throw err;
  }

  // Demo: usuarios bloqueados
  if (email.toLowerCase().includes("+bloqueado")) {
    const err = new Error("El usuario está bloqueado.");
    err.code = "USER_BLOCKED";
    throw err;
  }

  // Devuelve un payload tipo JWT simulado
  return {
    token: "demo.jwt.token",
    user: {
      email,
      role,
      name: email.split("@")[0],
    },
  };
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [role, setRole] = useState(() => localStorage.getItem("role") || "tracker");
  const [email, setEmail] = useState(() => localStorage.getItem("rememberEmail") || "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(Boolean(localStorage.getItem("rememberEmail")));
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const redirectPath = useMemo(() => {
    // Si venías de una ruta protegida, podrías tener un state { from: "/ruta" }
    const stateFrom = location.state?.from;
    if (stateFrom) return stateFrom;

    switch (role) {
      case "owner":
        return "/owner";
      case "admin":
        return "/admin";
      default:
        return "/tracker";
    }
  }, [role, location.state]);

  useEffect(() => {
    document.title = `${APP_TITLE} — Ingreso`;
  }, []);

  useEffect(() => {
    localStorage.setItem("role", role);
  }, [role]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrMsg("");
    setLoading(true);

    try {
      const res = await fakeSignIn({ email: email.trim(), password, role });
      // Guarda token de sesión (ajusta a tu estrategia: cookies httpOnly, storage seguro, etc.)
      sessionStorage.setItem("token", res.token);
      sessionStorage.setItem("user", JSON.stringify(res.user));

      if (rememberMe) {
        localStorage.setItem("rememberEmail", email.trim());
      } else {
        localStorage.removeItem("rememberEmail");
      }

      navigate(redirectPath, { replace: true });
    } catch (err) {
      setErrMsg(err?.message || "No se pudo iniciar sesión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <header className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            {APP_TITLE}
          </h1>
          <p className="text-sm text-slate-600 mt-2">Ingreso seguro — selecciona tu rol</p>
        </header>

        <div className="bg-white shadow-xl rounded-2xl p-6 md:p-8 border border-slate-200">
          {/* Selector de Rol */}
          <RoleSegmentedControl role={role} setRole={setRole} />

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-4 focus:ring-slate-200"
                placeholder="tucorreo@empresa.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-12 outline-none focus:ring-4 focus:ring-slate-200"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 px-3 text-sm text-slate-600 hover:text-slate-900"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Mínimo 6 caracteres. Evita reutilizar contraseñas.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Recordarme
              </label>

              <button
                type="button"
                className="text-sm text-slate-600 hover:text-slate-900 underline underline-offset-4"
                onClick={() => alert("Implementa recuperación de contraseña con tu backend.")}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            {errMsg ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errMsg}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-900 text-white py-2.5 font-medium hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </form>

          {/* Pie de página */}
          <div className="mt-6 text-center text-xs text-slate-500">
            <p>
              Acceso como: <strong className="text-slate-700">{prettyRole(role)}</strong>
            </p>
            <p className="mt-1">© {new Date().getFullYear()} — Control de personal con geocercas</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function prettyRole(roleKey) {
  const found = ROLES.find((r) => r.key === roleKey);
  return found ? found.label : roleKey;
}

function RoleSegmentedControl({ role, setRole }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">Selecciona tu rol</label>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {ROLES.map((r) => {
          const active = r.key === role;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setRole(r.key)}
              className={[
                "rounded-xl border px-3 py-2 text-sm text-left transition-all",
                active
                  ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                  : "border-slate-300 bg-white hover:border-slate-400",
              ].join(" ")}
              aria-pressed={active}
            >
              <div className="font-semibold leading-5">{r.label}</div>
              <div className="text-[11px] opacity-80">{r.hint}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
