// src/context/AuthProvider.tsx
// COMPAT SHIM (no usar en imports nuevos)
// ------------------------------------------------------------
// Este archivo existe SOLO para no romper imports viejos.
// La fuente única y canónica de Auth en TODO el proyecto es:
//   "@/auth/AuthProvider.jsx"
//
// Regla del proyecto:
//   ✅ Importar SIEMPRE desde "@/auth/AuthProvider.jsx"
//   ❌ NO importar desde "@/context/*"
//
// Cuando ya no existan imports a este archivo, se puede eliminar.

export {
  AuthProvider,
  useAuth,
  useAuthSafe,
  default,
} from "@/auth/AuthProvider.jsx";