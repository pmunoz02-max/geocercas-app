// src/lib/permissions.js

// 1. Constantes de roles
export const ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  TRACKER: "tracker",
};

// 2. Claves de módulos (rutas / secciones)
export const MODULE_KEYS = {
  INICIO: "inicio",
  GEOCERCAS: "geocercas",
  PERSONAL: "personal",
  ACTIVIDADES: "actividades",
  ASIGNACIONES: "asignaciones",
  REPORTES_COSTOS: "reportesCostos",
  DASHBOARD_COSTOS: "dashboardCostos",
  TRACKER: "tracker",
  INVITAR_TRACKER: "invitarTracker",
  ADMINS: "admins",
};

// 3. Matriz de permisos (UNICA FUENTE DE VERDAD)
const MODULE_PERMISSIONS = {
  // Módulos abiertos a todos los usuarios autenticados
  [MODULE_KEYS.INICIO]: [ROLES.OWNER, ROLES.ADMIN, ROLES.TRACKER],
  [MODULE_KEYS.GEOCERCAS]: [ROLES.OWNER, ROLES.ADMIN],
  [MODULE_KEYS.PERSONAL]: [ROLES.OWNER, ROLES.ADMIN],
  [MODULE_KEYS.ACTIVIDADES]: [ROLES.OWNER, ROLES.ADMIN],
  [MODULE_KEYS.ASIGNACIONES]: [ROLES.OWNER, ROLES.ADMIN],

  // 🔐 SOLO COSTOS (lo importante de este chat)
  [MODULE_KEYS.REPORTES_COSTOS]: [ROLES.OWNER, ROLES.ADMIN],
  [MODULE_KEYS.DASHBOARD_COSTOS]: [ROLES.OWNER, ROLES.ADMIN],

  // Tracker ve solo lo suyo
  [MODULE_KEYS.TRACKER]: [ROLES.OWNER, ROLES.ADMIN, ROLES.TRACKER],

  // Invitaciones y admins solo dueño/admin
  [MODULE_KEYS.INVITAR_TRACKER]: [ROLES.OWNER, ROLES.ADMIN],
  [MODULE_KEYS.ADMINS]: [ROLES.OWNER, ROLES.ADMIN],
};

export function normalizeRole(role) {
  return (role || "").toString().toLowerCase();
}

// 4. Función universal de acceso
export function canAccessModule(rawRole, moduleKey) {
  const role = normalizeRole(rawRole);
  const allowedRoles = MODULE_PERMISSIONS[moduleKey];

  // Si no está en la tabla, por defecto lo dejamos abierto
  if (!allowedRoles) return true;

  return allowedRoles.includes(role);
}
