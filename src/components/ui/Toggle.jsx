// src/components/ui/Toggle.jsx
export default function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={!!checked}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="h-5 w-9 rounded-full bg-white/10 border border-white/10 peer-checked:bg-emerald-500/80 peer-checked:border-emerald-400/40 transition-colors relative">
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        ></span>
      </span>
      <span className="text-sm text-slate-200">{label}</span>
    </label>
  );
}
