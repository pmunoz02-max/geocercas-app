// src/pages/AdminAssign.tsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabaseClient";

type Org = { id: string; name: string };
type Role = { id: string; slug: "owner" | "admin" | "tracker"; name: string };

export default function AdminAssign() {
  const { t } = useTranslation();

  const tt = (key: string, fallback: string, options: Record<string, unknown> = {}) => {
    try {
      const value = t(key, { defaultValue: fallback, ...options });
      if (typeof value !== "string") return fallback;
      const normalized = value.trim();
      if (!normalized || normalized === key) return fallback;
      return value;
    } catch {
      return fallback;
    }
  };

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
      const [{ data: orgData, error: orgErr }, { data: roleData, error: roleErr }] = await Promise.all([
        supabase.from("orgs").select("id,name").order("name", { ascending: true }),
        supabase.from("roles").select("id,slug,name").order("name", { ascending: true }),
      ]);

      if (!mounted) return;

      if (orgErr) console.error("[AdminAssign] orgs load error:", orgErr);
      if (roleErr) console.error("[AdminAssign] roles load error:", roleErr);

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

    if (!orgId) {
      return setMsg(tt("adminAssign.messages.selectOrg", "Select an organization."));
    }

    if (!roleSlug) {
      return setMsg(tt("adminAssign.messages.selectRole", "Select a role."));
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc("admin_assign_role_org", {
        p_email: email.trim(),
        p_role_slug: roleSlug,
        p_org_id: orgId,
      });

      if (error) {
        setMsg(
          tt("adminAssign.messages.assignFailed", "Could not assign: {{message}}", {
            message: error.message,
          })
        );
        return;
      }

      switch (data?.status) {
        case "NEEDS_MAGIC_LINK":
          setMsg(
            tt(
              "adminAssign.messages.needsMagicLink",
              "This email does not exist in Auth yet. Send a Magic Link and then assign again."
            )
          );
          break;
        case "OK":
          setMsg(tt("adminAssign.messages.assignOk", "Assignment completed ✅"));
          break;
        case "FORBIDDEN":
          setMsg(data?.message ?? tt("adminAssign.messages.forbidden", "Not authorized."));
          break;
        case "ERROR":
          setMsg(data?.message ?? tt("adminAssign.messages.serverError", "Error."));
          break;
        default:
          setMsg(
            tt(
              "adminAssign.messages.unknownResponse",
              "Unknown response from the server."
            )
          );
      }
    } catch (e: any) {
      setMsg(e?.message ?? tt("adminAssign.messages.unknownError", "Unknown error."));
    } finally {
      setLoading(false);
    }
  };

  const sendMagicLink = async () => {
    const target = email.trim();

    if (!target) {
      return setMsg(
        tt(
          "adminAssign.messages.enterEmailForMagicLink",
          "Enter an email to send the Magic Link."
        )
      );
    }

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
        setMsg(
          tt("adminAssign.messages.magicLinkFailed", "Could not send the Magic Link: {{message}}", {
            message: error.message,
          })
        );
      } else {
        setMsg(
          tt(
            "adminAssign.messages.magicLinkSent",
            "Magic Link sent. Open the link from that email and then assign again."
          )
        );
      }
    } catch (e: any) {
      setMsg(e?.message ?? tt("adminAssign.messages.unknownError", "Unknown error."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">
        {tt("adminAssign.title", "Assign role + organization")}
      </h1>

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          {tt("adminAssign.form.emailLabel", "Email")}
        </label>
        <input
          type="email"
          className="w-full border rounded px-3 py-2"
          placeholder={tt("adminAssign.form.emailPlaceholder", "name@example.com")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          {tt("adminAssign.form.roleLabel", "Role")}
        </label>
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
        <label className="block text-sm font-medium">
          {tt("adminAssign.form.organizationLabel", "Organization")}
        </label>
        <select
          className="w-full border rounded px-3 py-2"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
        >
          <option value="">
            {tt("adminAssign.form.organizationPlaceholder", "-- Select --")}
          </option>
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
          {loading
            ? tt("adminAssign.actions.processing", "Processing...")
            : tt("adminAssign.actions.assign", "Assign role + org")}
        </button>

        <button
          className="px-4 py-2 rounded border"
          disabled={loading || !email.trim()}
          onClick={sendMagicLink}
          title={tt(
            "adminAssign.actions.magicLinkTitle",
            "Send Magic Link if the email does not exist in Auth yet"
          )}
        >
          {tt("adminAssign.actions.sendMagicLink", "Send Magic Link")}
        </button>
      </div>

      {msg && <p className="text-sm text-gray-700">{msg}</p>}
    </div>
  );
}
