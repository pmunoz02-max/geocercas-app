// src/pages/Members.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listMembers, listMyOrganizations, setMemberRole } from "@/services/orgs";
import { supabase } from "../supabaseClient";

const ROLE_OPTIONS = ["owner", "admin", "tracker", "viewer"];

export default function Members() {
  const { t } = useTranslation();

  const tt = (key, fallback, options = {}) => {
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

  const { orgId } = useParams();
  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(null);

  const myRole = useMemo(() => org?.role ?? "viewer", [org]);
  const canManage = myRole === "owner" || myRole === "admin";

  const load = async () => {
    setLoading(true);
    try {
      const mine = await listMyOrganizations();
      const current = (mine || []).find((m) => m.org_id === orgId) || null;
      setOrg(current);

      const rows = await listMembers(orgId);
      const normalized = (rows || []).map((r) => ({
        user_id: r.user_id,
        org_id: r.org_id,
        role: r.role,
        created_at: r.created_at,
        full_name: r.profiles?.full_name || tt("members.fallbacks.noName", "(no name)"),
        avatar_url: r.profiles?.avatar_url || null,
      }));
      setMembers(normalized);
    } catch (err) {
      console.error(err);
      alert(tt("members.messages.loadError", "No se pudieron cargar los miembros."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) load();
  }, [orgId]);

  const updateRole = async (userId, role) => {
    try {
      setChanging(userId);
      await setMemberRole(orgId, userId, role);
      await load();
    } catch (err) {
      console.error(err);
      alert(tt("members.messages.updateRoleError", "No se pudo cambiar el rol."));
    } finally {
      setChanging(null);
    }
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    location.assign("/");
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/orgs" className="px-3 py-2 rounded-xl shadow border hover:bg-gray-50">
            ← {tt("members.actions.backToOrganizations", "My organizations")}
          </Link>
          <h1 className="text-2xl font-bold">{tt("members.title", "Members")}</h1>
        </div>
        <button
          onClick={onLogout}
          className="px-3 py-2 rounded-xl shadow border hover:bg-gray-50"
        >
          {tt("members.actions.logout", "Log out")}
        </button>
      </div>

      {org ? (
        <div className="text-sm text-gray-700">
          {tt("members.labels.organization", "Organization")}:{" "}
          <span className="font-semibold">{org.org_name}</span> ·{" "}
          {tt("members.labels.yourRole", "Your role")}:{" "}
          <span className="font-semibold">{org.role}</span>
        </div>
      ) : (
        <div className="text-sm text-red-600">
          {tt(
            "members.messages.noAccess",
            "You do not belong to this organization or you do not have permission."
          )}
        </div>
      )}

      {loading ? (
        <div className="p-4">{tt("members.states.loading", "Loading…")}</div>
      ) : (
        <div className="border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">{tt("members.table.user", "User")}</th>
                <th className="text-left p-3">{tt("members.table.role", "Role")}</th>
                <th className="text-left p-3">{tt("members.table.actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {m.avatar_url ? (
                        <img
                          src={m.avatar_url}
                          alt={tt("members.labels.avatar", "avatar")}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200" />
                      )}
                      <div>
                        <div className="font-medium">{m.full_name}</div>
                        <div className="text-xs text-gray-500">{m.user_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-1 rounded-lg border">{m.role}</span>
                  </td>
                  <td className="p-3">
                    {canManage ? (
                      <select
                        disabled={changing === m.user_id}
                        value={m.role}
                        onChange={(e) => updateRole(m.user_id, e.target.value)}
                        className="border rounded-xl px-2 py-1"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-400">
                        {tt("members.states.noPermissions", "No permissions")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td className="p-4 text-center text-gray-600" colSpan={3}>
                    {tt("members.states.empty", "There are no registered members.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-500">
        * {tt("members.notes.roleChangeRulePrefix", "Changing roles requires being")}{" "}
        <span className="font-semibold">owner</span> {tt("members.notes.or", "or")}{" "}
        <span className="font-semibold">admin</span>.{" "}
        {tt(
          "members.notes.rlsProtected",
          "Write permissions are protected by RLS."
        )}
      </div>
    </div>
  );
}
