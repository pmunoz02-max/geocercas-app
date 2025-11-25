// src/components/layout/Header.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';

// Fallback inline styles (garantiza legibilidad aun sin Tailwind)
const baseStyle = {
  textDecoration: 'none',
  color: '#e5e7eb',         // slate-200
  padding: '8px 12px',
  borderRadius: '8px',
  marginRight: '8px',
  display: 'inline-block',
};
const activeStyle = {
  background: '#10b981',    // emerald-500
  color: '#ffffff',
};
const hoverStyle = {
  background: '#334155',    // slate-700
  color: '#ffffff',
};

function LinkItem({ to, children }) {
  // Usamos style + onMouseEnter/Leave para tener hover aunque falte Tailwind
  const [hover, setHover] = React.useState(false);
  return (
    <NavLink
      to={to}
      className="no-underline px-3 py-2 rounded-lg text-sm font-medium transition-colors text-slate-100 hover:bg-slate-700 hover:text-white"
      style={({ isActive }) => ({
        ...baseStyle,
        ...(hover ? hoverStyle : null),
        ...(isActive ? activeStyle : null),
      })}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </NavLink>
  );
}

export default function Header() {
  return (
    <header className="w-full bg-slate-900 text-white" style={{ background: '#0f172a', color: '#e5e7eb' }}>
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between" style={{ maxWidth: '80rem', padding: '12px 16px' }}>
        {/* Marca */}
        <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="text-lg font-semibold tracking-wide" style={{ fontSize: '1.125rem', fontWeight: 600 }}>
            App Geocercas
          </span>
        </div>

        {/* Navegación */}
        <nav className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center' }}>
          <LinkItem to="/geocercas">Geocercas</LinkItem>
          <LinkItem to="/personal">Personal</LinkItem>
          <LinkItem to="/asignaciones">Asignaciones</LinkItem>
          <LinkItem to="/tracker">Tracker</LinkItem>
        </nav>
      </div>
    </header>
  );
}

