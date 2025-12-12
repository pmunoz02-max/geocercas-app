import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext.jsx";

export default function OnboardingCreateOrgPage() {
  const { user, currentOrg, reloadAuth } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (currentOrg?.id) {
      window.location.replace("/app");
    }
  }, [currentOrg]);

  async function createOrg() {
    try {
      setMsg("");

      if (!user) {
        setMsg("Debes iniciar sesión.");
        return;
      }

      if (!name.trim()) {
        setMsg("Escribe el nombre de tu organización.");
        return;
      }

      setBusy(true);

      const { error } = await supabase.rpc(
        "create_organization_for_current_user",
        { p_name: name.trim() }
      );

      if (error) throw error;

      // 🔑 CLAVE: refrescar estado canónico desde DB
      await reloadAuth();

      setMsg("Organización creada. Redirigiendo…");
      window.location.replace("/app");
    } catch (e) {
      console.error("[OnboardingCreateOrgPage] createOrg error:", e);
      setMsg(e?.message || "No se pudo crear la organización.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <h1 style={styles.title}>Crea tu organización</h1>
        <p style={styles.text}>
          Para usar App Geocercas necesitas una organización. Esto habilita el
          modelo multi-tenant y la seguridad por organización.
        </p>

        <label style={styles.label}>Nombre de la organización</label>
        <input
          style={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />

        <button style={styles.btn} onClick={createOrg} disabled={busy}>
          {busy ? "Creando…" : "Crear mi organización"}
        </button>

        {msg && <div style={styles.msg}>{msg}</div>}
      </div>
    </div>
  );
}

const styles = {
  screen: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#0f172a",
    padding: 20,
  },
  card: {
    width: "min(720px, 95vw)",
    background: "#0b1225",
    borderRadius: 16,
    padding: 18,
    color: "#e5e7eb",
  },
  title: { margin: "0 0 8px", fontSize: 22 },
  text: { margin: "0 0 16px", color: "#bac1cf" },
  label: { display: "block", marginBottom: 6, fontWeight: 700 },
  input: { width: "100%", height: 40, marginBottom: 12 },
  btn: { width: "100%", height: 42 },
  msg: { marginTop: 12 },
};
