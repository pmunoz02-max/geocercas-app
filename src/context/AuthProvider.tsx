// src/context/AuthProvider.tsx
// COMPAT SHIM (único y universal)
// Si algún import antiguo apunta a "@/context/AuthProvider", re-enrutamos al Auth real.
// Fuente de verdad: src/context/AuthContext.jsx (vía src/auth/AuthProvider.jsx)

export { AuthProvider, useAuth, useAuthSafe } from "@/auth/AuthProvider.jsx";