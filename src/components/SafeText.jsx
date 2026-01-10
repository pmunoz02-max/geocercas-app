import React from "react";

export function toSafeString(x, fallback = "") {
  if (x == null) return fallback;
  if (typeof x === "string") return x;
  if (typeof x === "number" || typeof x === "boolean") return String(x);
  try {
    return JSON.stringify(x);
  } catch {
    try {
      return String(x);
    } catch {
      return fallback;
    }
  }
}

/**
 * SafeText: nunca deja que React intente renderizar un objeto.
 * Úsalo donde hoy tengas: {algo}
 * y no tengas 100% certeza que es string/number.
 */
export default function SafeText({ value, fallback = "" }) {
  const s = toSafeString(value, fallback);
  return <>{s}</>;
}
