// src/auth/AuthProvider.jsx
// SHIM UNIVERSAL: evita pantalla blanca por 2 AuthContext distintos.
// Fuente de verdad: src/context/AuthContext.jsx
// Todos deben terminar usando el MISMO provider/hook.

import React from "react";
import {
  AuthProvider as CoreAuthProvider,
  useAuth as coreUseAuth,
} from "@/context/AuthContext.jsx";

// Re-export del provider real
export function AuthProvider({ children }) {
  return <CoreAuthProvider>{children}</CoreAuthProvider>;
}

// Re-export del hook real
export function useAuth() {
  return coreUseAuth();
}

// Export default por compatibilidad (si alguien hace import default)
export default AuthProvider;