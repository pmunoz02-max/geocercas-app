/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  safelist: [
    // Asegura utilidades con brackets (arbitrary values) y algunas claves del landing
    "bg-gradient-to-b",
    "from-slate-950",
    "via-slate-900",
    "to-slate-950",
    "backdrop-blur",
    "backdrop-blur-sm",
    "border-white/10",
    "border-white/5",
    "bg-slate-950/60",
    "bg-slate-950/70",
    "bg-slate-900/60",
    "bg-slate-900/80",
    "shadow-2xl",
    "shadow-black/40",
    "text-slate-100",
    "text-slate-200",
    "text-slate-300",
    "text-slate-400",
    "text-emerald-300",
    "text-emerald-400"
  ],
};
