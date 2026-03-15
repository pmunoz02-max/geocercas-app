// src/auth/AuthProvider.jsx
// SHIM UNICO: toda la app debe importar Auth desde aqui.
// Fuente de verdad: src/context/AuthContext.jsx
// Logica canonica (isAuthenticated, currentOrg/currentOrgId, y prioridad
// serverOrgId > localStorage fallback) vive en AuthContext.
export { AuthProvider, useAuth, useAuthSafe } from "@/context/AuthContext.jsx";