// src/components/ui/DatePickerField.jsx
import { useId, useMemo, useRef } from "react";

/**
 * DatePickerField (ligero, compatible con WebView/TWA)
 * - Usa input HTML nativo (type="date" por defecto)
 * - Icono calendario clickeable (abre el selector con showPicker si existe)
 * - Valor controlado: string "YYYY-MM-DD" (recomendado)
 */
export default function DatePickerField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  disabled,
  required,
  className = "",
  inputClassName = "",
  type = "date",
  name,
  ariaLabel
}) {
  const autoId = useId();
  const inputId = useMemo(() => id || `dp-${autoId}`.replaceAll(":", ""), [id, autoId]);
  const inputRef = useRef(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el || disabled) return;
    // Chromium/Android WebView moderno soporta showPicker()
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // fallback
      }
    }
    try {
      el.focus();
      // algunos navegadores abren el picker con click
      el.click?.();
    } catch {
      /* noop */
    }
  };

  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
          {label}
        </label>
      ) : null}

      <div className="relative mt-1">
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type={type}
          value={value || ""}
          onChange={(e) => onChange?.(e.target.value)}
          min={min || undefined}
          max={max || undefined}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel || label || "date"}
          className={
            "block w-full border rounded-lg px-3 py-2 pr-10 text-sm " +
            "bg-white disabled:bg-slate-50 disabled:text-slate-400 " +
            "focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 " +
            inputClassName
          }
        />

        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          className={
            "absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 " +
            "hover:text-slate-700 disabled:text-slate-300"
          }
          aria-label="open calendar"
          title="Open calendar"
        >
          {/* Icono calendario (SVG inline) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 2v4" />
            <path d="M16 2v4" />
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M3 10h18" />
            <path d="M8 14h.01" />
            <path d="M12 14h.01" />
            <path d="M16 14h.01" />
            <path d="M8 18h.01" />
            <path d="M12 18h.01" />
            <path d="M16 18h.01" />
          </svg>
        </button>
      </div>
    </div>
  );
}
