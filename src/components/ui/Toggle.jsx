// src/components/ui/Toggle.jsx
export default function Toggle({ checked, onChange, label }) {
return (
<label className="inline-flex items-center gap-2 cursor-pointer select-none">
<input type="checkbox" className="peer sr-only" checked={!!checked} onChange={(e)=>onChange?.(e.target.checked)} />
<span className="h-5 w-9 rounded-full bg-gray-300 peer-checked:bg-green-500 transition-colors relative">
<span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`}></span>
</span>
<span className="text-sm">{label}</span>
</label>
);
}