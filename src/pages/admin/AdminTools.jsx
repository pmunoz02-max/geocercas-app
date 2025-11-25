// src/pages/Admin/AdminTools.jsx
import { Link } from "react-router-dom";

/**
 * Panel de herramientas de administrador
 * - Página simple con enlaces a submódulos administrativos.
 * - No depende de ningún estilo global ni librería adicional.
 * - Mantiene semántica accesible y enlaces con <Link>.
 *
 * Asegúrate de tener definida la ruta:
 *   /admin/usuarios-roles  ->  <UsersRoles />
 */

const tools = [
  {
    to: "/admin/usuarios-roles",
    title: "Gestión de usuarios y roles",
    desc: "Crear, asignar y revocar roles (owner, admin, tracker).",
  },
  // Puedes habilitar más herramientas luego:
  // { to: "/admin/organizaciones", title: "Organizaciones", desc: "Crear y administrar organizaciones." },
  // { to: "/admin/geocercas-auditoria", title: "Auditoría de geocercas", desc: "Historial de cambios y eventos." },
];

export default function AdminTools() {
  return (
    <main style={styles.wrapper} aria-labelledby="admin-title">
      <header style={styles.header}>
        <h1 id="admin-title" style={styles.h1}>Herramientas de administrador</h1>
        <p style={styles.lead}>
          Selecciona un módulo para administrar tu app. Este panel está protegido para usuarios con rol
          <em> owner</em> o <em>admin</em>.
        </p>
      </header>

      <section>
        <ul style={styles.list}>
          {tools.map((item) => (
            <li key={item.to} style={styles.item}>
              <div style={styles.itemBody}>
                <h2 style={styles.itemTitle}>{item.title}</h2>
                <p style={styles.itemDesc}>{item.desc}</p>
              </div>
              <Link to={item.to} style={styles.link} aria-label={`Abrir ${item.title}`}>
                Abrir →
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <nav style={styles.navBack}>
        <Link to="/" style={styles.backLink}>← Volver al inicio</Link>
      </nav>
    </main>
  );
}

/* --- Estilos inline minimalistas para no romper tu app --- */
const styles = {
  wrapper: {
    padding: 24,
    maxWidth: 960,
    margin: "0 auto",
  },
  header: { marginBottom: 16 },
  h1: { margin: 0, fontSize: 28, lineHeight: 1.2 },
  lead: { margin: "8px 0 0", color: "#555" },
  list: {
    listStyle: "none",
    padding: 0,
    margin: "16px 0 0",
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    border: "1px solid #e5e5e5",
    borderRadius: 8,
    background: "#fff",
  },
  itemBody: { flex: 1, minWidth: 0 },
  itemTitle: { margin: 0, fontSize: 18 },
  itemDesc: { margin: "6px 0 0", color: "#666", fontSize: 14 },
  link: {
    whiteSpace: "nowrap",
    textDecoration: "none",
    border: "1px solid #ddd",
    padding: "8px 12px",
    borderRadius: 6,
  },
  navBack: { marginTop: 20 },
  backLink: { textDecoration: "none" },
};
