// src/context/AuthProvider.tsx
// COMPAT SHIM (único y universal)
// Si algo (actual o legado) resuelve/importa este módulo, debe apuntar SIEMPRE al Auth real.
// Fuente de verdad: src/context/AuthContext.jsx (expuesto por src/auth/AuthProvider.jsx)

export { AuthProvider, useAuth, useAuthSafe } from "@/auth/AuthProvider.jsx";