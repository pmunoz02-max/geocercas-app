// src/pages/AdminAssign.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
      if (orgErr) console.error(orgErr);
      if (roleErr) console.error(roleErr);
      setOrgs(orgData ?? []);
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
    if (!orgId) return setMsg("Selecciona una organización.");
    if (!roleSlug) return setMsg("Selecciona un rol.");

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_assign_role_org", {
        p_email: email.trim(),
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
    const target = email.trim();
    if (!target) return setMsg("Ingresa un email para enviar el Magic Link.");

    setLoading(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: target,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setMsg(`No se pudo enviar el Magic Link: ${error.message}`);
      } else {
        setMsg("Magic Link enviado. Abre el enlace con ese correo y vuelve a asignar.");
      }
    } catch (e: any) {
      setMsg(e?.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Asignar rol + organización</h1>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Email</label>
        <input
          type="email"
          className="w-full border rounded px-3 py-2"
          placeholder="pmunoz02@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Rol</label>
        <select
          className="w-full border rounded px-3 py-2"
          value={roleSlug}
          onChange={(e) => setRoleSlug(e.target.value as Role["slug"])}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.slug}>
              {r.name} ({r.slug})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">Organización</label>
        <select
          className="w-full border rounded px-3 py-2"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
        >
          <option value="">-- Selecciona --</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          disabled={!canSubmit}
          onClick={onAssign}
        >
          {loading ? "Procesando..." : "Asignar rol + org"}
        </button>

        <button
          className="px-4 py-2 rounded border"
          disabled={loading || !email.trim()}
          onClick={sendMagicLink}
          title="Enviar Magic Link si el correo aún no existe en Auth"
        >
          Enviar Magic Link
        </button>
      </div>

      {msg && <p className="text-sm text-gray-700">{msg}</p>}
    </div>
  );
}
