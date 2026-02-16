// src/components/ui/Badge.jsx
export default function Badge({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs font-semibold text-slate-200">
      {children}
    </span>
  );
}
