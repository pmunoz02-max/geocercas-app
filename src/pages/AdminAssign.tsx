// src/pages/AdminAssign.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type Org = { id: string; name: string };
type Role = { id: string; slug: "owner" | "admin" | "tracker"; name: string };

export default function AdminAssign() {
  const [email, setEmail] = useState("");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [roleSlug, setRoleSlug] = useState<Role["slug"]>("tracker");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [{ data: orgData, error: orgErr }, { data: roleData, error: roleErr }] =
        await Promise.all([
          supabase.from("orgs").select("id,name").order("name", { ascending: true }),
          supabase.from("roles").select("id,slug,name").order("name", { ascending: true }),
        ]);

      if (!mounted) return;

      if (orgErr) console.error("orgs error:", orgErr);
      if (roleErr) console.error("roles error:", roleErr);

      setOrgs((orgData ?? []) as Org[]);
      setRoles((roleData ?? []) as Role[]);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const canSubmit = useMemo(
    () => email.trim().length > 3 && orgId && roleSlug && !loading,
    [email, orgId, roleSlug, loading]
  );

  const onAssign = async () => {
    setMsg(null);

    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) return setMsg("Ingresa un email.");
    if (!orgId) return setMsg("Selecciona una organización.");
    if (!roleSlug) return setMsg("Selecciona un rol.");

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_assign_role_org", {
        p_email: targetEmail,
        p_role_slug: roleSlug,
        p_org_id: orgId,
      });

      if (error) {
        setMsg(`No se pudo asignar: ${error.message}`);
        return;
      }

      switch (data?.status) {
        case "NEEDS_MAGIC_LINK":
          setMsg("El correo no existe en Auth. Envía Magic Link y vuelve a asignar.");
          break;
        case "OK":
          setMsg("Asignación completada ✅");
          break;
        case "FORBIDDEN":
          setMsg(data?.message ?? "No autorizado");
          break;
        case "ERROR":
          setMsg(data?.message ?? "Error");
          break;
        default:
          setMsg("Respuesta desconocida del servidor.");
      }
    } catch (e: any) {
      setMsg(e?.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const sendMagicLink = async () => {
    const target = email.trim().toLowerCase();
    if (!target) return setMsg("Ingresa un email para enviar el Magic Link.");

    setLoading(true);
    setMsg(null);
    try {
      // Si tu proyecto usa OTP/link desde el frontend:
      const { error } = await supabase.auth.signInWithOtp({
        email: target,
        options: {
          // Si ya tienes un redirect URL estándar, mantenlo aquí:
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setMsg(`No se pudo enviar Magic Link: ${error.message}`);
        return;
      }

      setMsg("Magic Link enviado ✅ (revisa correo)");
    } catch (e: any) {
      setMsg(e?.message ?? "Error enviando Magic Link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-2xl font-semibold mb-4">Administradores (Root)</h1>

      {msg && (
        <div className="mb-4 rounded border border-slate-200 bg-white p-3 text-sm">
          {msg}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3">
          <label className="text-sm">
            Email usuario
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nuevoadmin@dominio.com"
              autoComplete="email"
            />
          </label>

          <label className="text-sm">
            Organización
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            >
              <option value="">-- Selecciona --</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.id})
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Rol
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={roleSlug}
              onChange={(e) => setRoleSlug(e.target.value as Role["slug"])}
            >
              {/* Solo roles válidos por constraint: owner/admin/tracker */}
              <option value="tracker">tracker</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </select>
          </label>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              onClick={onAssign}
              disabled={!canSubmit}
            >
              {loading ? "Procesando..." : "Asignar rol"}
            </button>

            <button
              className="rounded-md border border-slate-300 px-4 py-2 disabled:opacity-50"
              onClick={sendMagicLink}
              disabled={loading || email.trim().length < 4}
              title="Si el usuario aún no existe en Auth"
            >
              Enviar Magic Link
            </button>
          </div>

          <p className="text-xs text-slate-600 pt-2">
            Nota: si el RPC responde NEEDS_MAGIC_LINK, primero envía Magic Link y luego vuelve a asignar.
          </p>
        </div>
      </div>
    </div>
  );
}
