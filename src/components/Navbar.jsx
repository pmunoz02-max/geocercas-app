// src/components/Navbar.jsx
import { NavLink } from "react-router-dom";

const base = "px-3 py-2 rounded-lg";
const active = "bg-blue-600 text-white";
const inactive = "text-gray-700 hover:bg-gray-100";

export default function Navbar() {
  return (
    <header className="border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="font-semibold">App Geocercas</div>
        <nav className="flex gap-2">
          <NavLink to="/" end className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>Inicio</NavLink>
          <NavLink to="/geocercas" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>Geocercas</NavLink>
          <NavLink to="/asignaciones" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>Asignaciones</NavLink>
          <NavLink to="/administracion" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>Administración</NavLink>
          <NavLink to="/personal" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>Personal</NavLink>
          <NavLink to="/tracker" className={({ isActive }) => `${base} ${isActive ? active : inactive}`}>Tracker</NavLink>
        </nav>
      </div>
    </header>
  );
}
