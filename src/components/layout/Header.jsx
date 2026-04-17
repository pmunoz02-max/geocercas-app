// src/components/layout/Header.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { applyLanguageSafely } from '@/i18n/i18n';

const LANGS = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
];
const SUPPORTED = new Set(['es', 'en', 'fr']);

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
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (e, lang) => {
    e.preventDefault();
    e.stopPropagation();

    if (!SUPPORTED.has(lang)) return;

    const normalized = String(lang).toLowerCase().slice(0, 2);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', normalized);
    window.history.replaceState({}, '', url.toString());

    applyLanguageSafely(normalized);
  };

  const currentLang = String(i18n?.resolvedLanguage || i18n?.language || 'es')
    .toLowerCase()
    .slice(0, 2);

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
          <LinkItem to="/geocercas">{t('app.tabs.geocercas')}</LinkItem>
          <LinkItem to="/personal">{t('app.tabs.personal')}</LinkItem>
          <LinkItem to="/asignaciones">{t('app.tabs.asignaciones')}</LinkItem>
          <LinkItem to="/tracker">{t('app.tabs.tracker')}</LinkItem>
        </nav>

        {/* Selector de idioma */}
        <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {LANGS.map((lang) => {
            const isActive = currentLang === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={(e) => handleLanguageChange(e, lang.code)}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  borderRadius: '4px',
                  border: `1px solid ${isActive ? '#10b981' : '#475569'}`,
                  background: isActive ? '#10b981' : 'transparent',
                  color: '#e5e7eb',
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
                aria-pressed={isActive}
              >
                {lang.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}

