import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "@/context/auth.js";

export default function OnboardingCreateOrgPage() {
  const { user, currentOrg, reloadAuth, setCurrentOrg } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    // Si ya tiene org, no deberÃ­a estar aquÃ­ (tu router lo redirigirÃ¡; igual protegemos)
    if (currentOrg?.id) setMsg("Ya tienes una organizaciÃ³n activa.");
  }, [currentOrg]);

  async function createOrg() {
    try {
      setMsg("");
      if (!user) {
        setMsg("Debes iniciar sesiÃ³n.");
        return;
      }
      if (!name.trim()) {
        setMsg("Escribe el nombre de tu organizaciÃ³n.");
        return;
      }

      setBusy(true);

      const { data, error } = await supabase.rpc(
        "create_organization_for_current_user",
        { p_name: name.trim() }
      );

      if (error) throw error;

      // data devuelve org_id (uuid) en la mayorÃ­a de implementaciones.
      // Pero el estado canÃ³nico debe venir de org_members + organizations.
      // 1) refrescamos AuthContext
      if (typeof reloadAuth === "function") {
        await reloadAuth();
      } else if (typeof setCurrentOrg === "function" && data) {
        // Fallback (si reloadAuth no existe por alguna razÃ³n)
        setCurrentOrg({ id: data, name: name.trim() });
      }

      setMsg("OrganizaciÃ³n creada. Redirigiendoâ€¦");
      window.location.replace("/app");
    } catch (e) {
      console.error("[OnboardingCreateOrgPage] createOrg error:", e);
      // Supabase a veces entrega error como objeto con { message, details, hint, code }
      const friendly =
        e?.message ||
        e?.details ||
        (typeof e === "string" ? e : null) ||
        "No se pudo crear la organizaciÃ³n.";
      setMsg(friendly);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <h1 style={styles.title}>Crea tu organizaciÃ³n</h1>
        <p style={styles.text}>
          Para usar App Geocercas necesitas una organizaciÃ³n. Esto habilita el
          modelo multi-tenant y la seguridad por organizaciÃ³n.
        </p>

        <label style={styles.label}>Nombre de la organizaciÃ³n</label>
        <input
          style={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Org de Pietro (producciÃ³n)"
          disabled={busy}
        />

        <button style={styles.btn} onClick={createOrg} disabled={busy}>
          {busy ? "Creandoâ€¦" : "Crear mi organizaciÃ³n"}
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
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
  },
  card: {
    width: "min(720px, 95vw)",
    background: "#0b1225",
    border: "1px solid #1f2a44",
    borderRadius: 16,
    padding: 18,
    color: "#e5e7eb",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  },
  title: { margin: "0 0 8px", fontSize: 22 },
  text: { margin: "0 0 16px", color: "#bac1cf", lineHeight: 1.4 },
  label: { display: "block", marginBottom: 6, fontWeight: 700 },
  input: {
    width: "100%",
    height: 40,
    borderRadius: 10,
    border: "1px solid #cbd5e1",
    background: "#0e1a34",
    color: "#e5e7eb",
    padding: "0 12px",
    outline: "none",
    marginBottom: 12,
  },
  btn: {
    width: "100%",
    height: 42,
    borderRadius: 10,
    border: "1px solid #047857",
    background: "#059669",
    color: "#ecfdf5",
    fontWeight: 800,
    cursor: "pointer",
  },
  msg: { marginTop: 12, color: "#e2e8f0" },
};

