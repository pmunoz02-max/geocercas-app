import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function AdminPanel() {
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
      <h1 className="text-2xl font-bold mb-4">Panel de Administración</h1>
      <p className="text-gray-600 mb-6">Gestione usuarios, roles y organizaciones desde aquí.</p>

      {/* USUARIOS */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Usuarios</h2>
        <table className="min-w-full border border-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">Nombre</th>
              <th className="p-2 border">Email</th>
              <th className="p-2 border">Rol</th>
              <th className="p-2 border">Fecha Creación</th>
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
        <h2 className="text-xl font-semibold mb-2">Roles</h2>
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
        <h2 className="text-xl font-semibold mb-2">Organizaciones</h2>
        <table className="min-w-full border border-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">Nombre</th>
              <th className="p-2 border">Descripción</th>
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
