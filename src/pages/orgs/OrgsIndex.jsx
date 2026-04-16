// src/pages/orgs/OrgsIndex.jsx
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function OrgsIndex() {
  const { t } = useTranslation();
  return (
    <div style={{ padding: 16 }}>
      <h2>{t('orgs.myTitle')}</h2>

      {/* Aquí luego listaremos desde Supabase */}
      <p>No tienes organizaciones aún.</p>

      <Link to="/orgs/new">
        <button>{t('orgs.createNew')}</button>
      </Link>
    </div>
  );
}
