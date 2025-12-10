// src/lib/permissions.js

export const ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  TRACKER: "tracker",
};

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

const MODULE_PERMISSIONS = {
  [MODULE_KEYS.INICIO]: [ROLES.OWNER, ROLES.ADMIN, ROLES.TRACKER],
  [MODULE_KEYS.GEOCERCAS]: [ROLES.OWNER, ROLES.ADMIN],
  [MODULE_KEYS.PERSONAL]: [ROLES.OWNER, ROLES.ADMIN],
  [MODULE_KEYS.ACTIVIDADES]: [ROLES.OWNER, ROLES.ADMIN],
  [MODULE_KEYS.ASIGNACIONES]: [ROLES.OWNER, ROLES.ADMIN],
  [MODULE_KEYS.REPORTES_COSTOS]: [ROLES.OWNER, ROLES.ADMIN],
  [MODULE_KEYS.DASHBOARD_COSTOS]: [ROLES.OWNER, ROLES.ADMIN],
  [MODULE_KEYS.TRACKER]: [ROLES.OWNER, ROLES.ADMIN, ROLES.TRACKER],
  [MODULE_KEYS.INVITAR_TRACKER]: [ROLES.OWNER, ROLES.ADMIN],
  [MODULE_KEYS.ADMINS]: [ROLES.OWNER, ROLES.ADMIN],
};

export function normalizeRole(role) {
  return (role || "").toString().toLowerCase();
}

export function canAccessModule(rawRole, moduleKey) {
  const role = normalizeRole(rawRole);
  const allowedRoles = MODULE_PERMISSIONS[moduleKey];

  if (!allowedRoles) return true; // por defecto abierto si no configuraste el módulo

  return allowedRoles.includes(role);
}
