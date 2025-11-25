// src/lib/datetimeLocal.js

// Devuelve fecha/hora local en formato "YYYY-MM-DDTHH:MM"
export function getNowLocalString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Normaliza distintos formatos de fecha/hora a "YYYY-MM-DDTHH:MM"
 *
 * Casos soportados:
 *  - "YYYY-MM-DDTHH:MM"  (valor típico de <input type="datetime-local" />)
 *  - "DD/MM/YYYY HH:MM"
 *  - "DD-MM-YYYY HH:MM"
 */
export function normalizeDatetimeLocal(value) {
  if (!value) return '';

  // Ya viene en formato datetime-local estándar
  if (value.includes('T')) {
    // Nos quedamos solo con los primeros 16 caracteres YYYY-MM-DDTHH:MM
    return value.slice(0, 16);
  }

  // Formatos tipo "DD/MM/YYYY HH:MM" o "DD-MM-YYYY HH:MM"
  const [datePart, timePartRaw] = value.split(' ');
  if (!datePart || !timePartRaw) return '';

  const sep = datePart.includes('/') ? '/' : '-';
  const [dd, mm, yyyy] = datePart.split(sep);
  if (!dd || !mm || !yyyy) return '';

  const timePart = timePartRaw.slice(0, 5); // HH:MM
  const day = String(dd).padStart(2, '0');
  const month = String(mm).padStart(2, '0');
  const year = String(yyyy);

  return `${year}-${month}-${day}T${timePart}`;
}

// datetime-local → 'YYYY-MM-DD'
export function toDateOnly(datetimeLocal) {
  if (!datetimeLocal) return null;
  return datetimeLocal.slice(0, 10);
}
