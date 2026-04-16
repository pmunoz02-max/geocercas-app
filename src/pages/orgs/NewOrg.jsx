// src/pages/orgs/NewOrg.jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NewOrg() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const navigate = useNavigate();

  const onSubmit = (e) => {
    e.preventDefault();
    // TODO: aquí luego llamamos a Supabase (RPC create_organization o similar)
    console.log("Crear org:", { name, slug });
    navigate("/orgs");
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>{t('orgs.newTitle')}</h2>
      <form onSubmit={onSubmit} style={{ maxWidth: 420 }}>
        <label>{t('orgs.form.name')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('orgs.form.namePlaceholder')}
          required
          style={{ display: "block", width: "100%", margin: "8px 0 16px" }}
        />

        <label>{t('orgs.form.slugOptional')}</label>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={t('orgs.form.slugPlaceholder')}
          style={{ display: "block", width: "100%", margin: "8px 0 16px" }}
        />

        <button type="submit">{t('orgs.form.create')}</button>
        <Link to="/orgs" style={{ marginLeft: 12 }}>
          <button type="button">{t('common.actions.cancel')}</button>
        </Link>
      </form>
    </div>
  );
}
