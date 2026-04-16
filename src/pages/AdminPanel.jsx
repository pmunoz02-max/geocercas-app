import { useEffect, useState } from 'react'
import { useTranslation } from "react-i18next";
import { supabase } from '../supabaseClient'

export default function AdminPanel() {
  const { t } = useTranslation();
  const [usuarios, setUsuarios] = useState([])
  const [roles, setRoles] = useState([])
  const [organizaciones, setOrganizaciones] = useState([])

  useEffect(() => {
    const fetchData = async () => {
      const { data: users } = await supabase.from('profiles').select('id, full_name, email, role_id, created_at')
      const { data: rolesData } = await supabase.from('roles').select('*')
      const { data: orgs } = await supabase.from('organizations').select('*')

      setUsuarios(users || [])
      setRoles(rolesData || [])
      setOrganizaciones(orgs || [])
    }

    fetchData()
  }, [])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{t("dashboard.adminPanel.title")}</h1>
      <p className="text-gray-600 mb-6">{t("dashboard.adminPanel.description")}</p>

      {/* USUARIOS */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">{t("dashboard.adminPanel.sections.users")}</h2>
        <table className="min-w-full border border-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">{t("dashboard.adminPanel.columns.name")}</th>
              <th className="p-2 border">{t("dashboard.adminPanel.columns.email")}</th>
              <th className="p-2 border">{t("dashboard.adminPanel.columns.role")}</th>
              <th className="p-2 border">{t("dashboard.adminPanel.columns.createdAt")}</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td className="p-2 border">{u.full_name}</td>
                <td className="p-2 border">{u.email}</td>
                <td className="p-2 border">{u.role_id}</td>
                <td className="p-2 border">{new Date(u.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ROLES */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">{t("dashboard.adminPanel.sections.roles")}</h2>
        <ul className="list-disc ml-6">
          {roles.map((r) => (
            <li key={r.id}>
              <strong>{r.name}</strong> — {r.description}
            </li>
          ))}
        </ul>
      </section>

      {/* ORGANIZACIONES */}
      <section>
        <h2 className="text-xl font-semibold mb-2">{t("dashboard.adminPanel.sections.organizations")}</h2>
        <table className="min-w-full border border-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">{t("dashboard.adminPanel.columns.name")}</th>
              <th className="p-2 border">{t("dashboard.adminPanel.columns.description")}</th>
            </tr>
          </thead>
          <tbody>
            {organizaciones.map((o) => (
              <tr key={o.id}>
                <td className="p-2 border">{o.name}</td>
                <td className="p-2 border">{o.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
