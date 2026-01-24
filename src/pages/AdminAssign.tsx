// src/pages/AdminAssign.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient"; // ✅ CANÓNICO (NO "./supabaseClient")

type Org = { id: string; name: string };
type Role = { id: string; slug: "owner" | "admin" | "tracker"; name: string };

function errText(e: any) {
  if (!e) return "Error desconocido";
  if (typeof e === "string") return e;
  return e?.message || e?.error_description || e?.hint || JSON.stringify(e);
}

export default function AdminAssign() {
  const [email, setEmail] = useState("");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [roleSlug, setRoleSlug] = useState<Role["slug"]>("tracker");
  const [loading, setLoading] = useState(false);

  // ✅ Avisos claros
  const [notice, setNotice] = useState<{ type: "ok" | "err" | "info"; text: string } | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [orgRes, roleRes] = await Promise.all([
        supabase.from("orgs").select("id,name").order("name", { ascending: true }),
        supabase.from("roles").select("id,slug,name").order("name", { ascending: true }),
      ]);

      if (!mounted) return;

      if (orgRes.error) {
        console.error("orgs error:", orgRes.error);
        setNotice({ type: "err", text: `No se pudieron cargar organizaciones: ${orgRes.error.message}` });
      } else {
        setOrgs((orgRes.data ?? []) as Org[]);
      }

      if (roleRes.error) {
        console.error("roles error:", roleRes.error);
        setNotice({ type: "err", text: `No se pudieron cargar roles: ${roleRes.error.message}` });
      } else {
        setRoles((roleRes.data ?? []) as Role[]);
      }
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
    setNotice(null);

    const targetEmail = email.trim().toLowerCase();
    if (!targetEmail) return setNotice({ type: "err", text: "Ingresa un email." });
    if (!orgId) return setNotice({ type: "err", text: "Selecciona una organización." });
    if (!roleSlug) return setNotice({ type: "err", text: "Selecciona un rol." });

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_assign_role_org", {
        p_email: targetEmail,
        p_role_slug: roleSlug,
        p_org_id: orgId,
      });

      if (error) {
        setNotice({ type: "err", text: `No se pudo asignar: ${error.message}` });
        return;
      }

      switch (data?.status) {
        case "NEEDS_MAGIC_LINK":
          setNotice({ type: "info", text: "El usuario no existe en Auth. Envía Magic Link y vuelve a asignar." });
          break;
        case "OK":
          setNotice({ type: "ok", text: "Asignación completada ✅" });
          break;
        case "FORBIDDEN":
          setNotice({ type: "err", text: data?.message ?? "No autorizado" });
          break;
        default:
          setNotice({ type: "info", text: data?.message ?? "Respuesta desconocida." });
      }
    } catch (e: any) {
      setNotice({ type: "err", text: errText(e) });
    } finally {
      setLoading(false);
    }
  };

  const sendMagicLink = async () => {
    const target = email.trim().toLowerCase();
    if (!target) return setNotice({ type: "err", text: "Ingresa un email para enviar el Magic Link." });

    setLoading(true);
    setNotice({ type: "info", text: "Enviando Magic Link..." });

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: target,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        console.error("MagicLink error:", error);
        setNotice({ type: "err", text: `❌ No se pudo enviar el Magic Link: ${error.message}` });
        return;
      }

      setNotice({ type: "ok", text: "✅ Magic Link enviado. Revisa el correo (Inbox/Spam)." });
    } catch (e: any) {
      console.error("MagicLink exception:", e);
      setNotice({ type: "err", text: `❌ Error enviando Magic Link: ${errText(e)}` });
    } finally {
      setLoading(false);
    }
  };

  const noticeClass =
    notice?.type === "ok"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : notice?.type === "err"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-slate-50 border-slate-200 text-slate-800";

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-2xl font-semibold mb-4">Administradores (Root)</h1>

      {notice && (
        <div className={`mb-4 rounded border p-3 text-sm ${noticeClass}`}>
          {notice.text}
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
            >
              {loading ? "Enviando..." : "Enviar Magic Link"}
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
