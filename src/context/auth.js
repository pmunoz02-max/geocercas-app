// src/context/auth.js
// SHIM UNIVERSAL: toda la app debe consumir auth desde el MISMO módulo
// Fuente: src/auth/AuthProvider.jsx -> src/context/AuthContext.jsx

export { AuthProvider, useAuth, useAuthSafe } from "@/auth/AuthProvider.jsx";
