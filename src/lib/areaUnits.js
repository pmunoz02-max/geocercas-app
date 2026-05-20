const AREA_UNIT_OPTIONS = [
  { value: "m2", label: "m²", factor: 1 },
  { value: "ha", label: "ha", factor: 0.0001 },
  { value: "km2", label: "km²", factor: 0.000001 },
  { value: "acres", label: "acres", factor: 0.000247105 },
];

const AREA_UNIT_KEY = "geocercas_area_unit";
const ALLOWED_UNITS = AREA_UNIT_OPTIONS.map((u) => u.value);

function getStoredAreaUnit() {
  if (typeof window === "undefined") return "m2";
  const unit = localStorage.getItem(AREA_UNIT_KEY);
  return ALLOWED_UNITS.includes(unit) ? unit : "m2";
}

function setStoredAreaUnit(unit) {
  if (typeof window === "undefined") return;
  if (ALLOWED_UNITS.includes(unit)) {
    localStorage.setItem(AREA_UNIT_KEY, unit);
  }
}

function formatAreaFromM2(areaM2, unit, locale) {
  if (areaM2 === null || areaM2 === undefined || areaM2 === "") return "—";
  const opt = AREA_UNIT_OPTIONS.find((u) => u.value === unit) || AREA_UNIT_OPTIONS[0];
  const value = Number(areaM2) * opt.factor;
  if (!Number.isFinite(value) || value < 0) return "—";
  const resolvedLocale = locale || (typeof navigator !== "undefined" ? navigator.language : "es-MX");
  return (
    new Intl.NumberFormat(resolvedLocale, { maximumFractionDigits: 2 }).format(value) +
    " " +
    opt.label
  );
}

export { AREA_UNIT_OPTIONS, getStoredAreaUnit, setStoredAreaUnit, formatAreaFromM2 };
