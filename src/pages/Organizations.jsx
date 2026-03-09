import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createOrganization, listMyOrganizations } from "@/services/orgs";
import { supabase } from "../supabaseClient";
import { useAuth } from "@/context/auth.js";

export default function Organizations() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  const tr = useCallback(
    (key, fallback, options = {}) => t(key, { defaultValue: fallback, ...options }),
    [t]
  );

  const [orgs, setOrgs] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setLoadingOrgs(true);
    setErrorMsg("");
    try {
      const rows = await listMyOrganizations();
      setOrgs(rows || []);
    } catch (err) {
      console.error(err);
      setOrgs([]);
      setErrorMsg(
        `${tr("organizations.errors.load", "Could not load organizations")}: ${err?.message || String(err)}`
      );
    } finally {
      setLoadingOrgs(false);
    }
  }, [tr]);

  useEffect(() => {
    load();
  }, [load]);

  const onCreate = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!name.trim()) {
      setErrorMsg(tr("organizations.errors.nameRequired", "Enter an organization name."));
      return;
    }

    try {
      await createOrganization(name.trim(), slug.trim() || null);
      setName("");
      setSlug("");
      await load();
    } catch (err) {
      console.error(err);
      setErrorMsg(
        `${tr("organizations.errors.create", "Could not create the organization")}: ${err?.message || String(err)}`
      );
    }
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    location.reload();
  };

  if (loading) {
    return null;
  }

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-sm text-slate-700">
          {tr(
            "organizations.auth.loginRequired",
            "You must sign in to manage your organizations."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {tr("organizations.title", "My Organizations")}
        </h1>
        <button
          onClick={onLogout}
          className="px-3 py-2 rounded-xl shadow border hover:bg-gray-50"
        >
          {tr("organizations.actions.logout", "Log out")}
        </button>
      </div>

      {errorMsg ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMsg}
        </div>
      ) : null}

      <form
        onSubmit={onCreate}
        className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border rounded-2xl shadow"
      >
        <input
          className="border rounded-xl px-3 py-2"
          placeholder={tr(
            "organizations.form.namePlaceholder",
            "Organization name (e.g. North Farm)"
          )}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border rounded-xl px-3 py-2"
          placeholder={tr(
            "organizations.form.slugPlaceholder",
            "slug (optional, e.g. north-farm)"
          )}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
        <button
          type="submit"
          className="rounded-2xl px-4 py-2 shadow bg-black text-white hover:opacity-90"
        >
          {tr("organizations.actions.create", "Create")}
        </button>
      </form>

      {loadingOrgs ? (
        <div className="p-4">{tr("organizations.states.loading", "Loading…")}</div>
      ) : orgs.length === 0 ? (
        <div className="p-4 border rounded-2xl">
          {tr("organizations.states.empty", "You do not have organizations yet.")}
        </div>
      ) : (
        <div className="grid gap-3">
          {orgs.map((o) => {
            const id = o.org_id || o.id;
            const orgName = o.org_name || o.name || tr("organizations.fallbacks.noName", "(no name)");

            return (
              <div
                key={`${id}-${o.user_id ?? ""}`}
                className="border rounded-2xl p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="text-lg font-semibold">{orgName}</div>
                  <div className="text-sm text-gray-600">
                    {tr("organizations.labels.role", "Role")}: <span className="font-medium">{o.role}</span>
                    {o.slug
                      ? ` · ${tr("organizations.labels.slug", "slug")}: ${o.slug}`
                      : ""}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 break-all">
                    {tr("organizations.labels.orgId", "Org ID")}: {id}
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Link
                    to={`/orgs/${id}/members`}
                    className="px-3 py-2 rounded-xl shadow border hover:bg-gray-50"
                  >
                    {tr("organizations.actions.viewMembers", "View members")}
                  </Link>
                  <Link
                    to={`/orgs/${id}/invitations`}
                    className="px-3 py-2 rounded-xl shadow border hover:bg-gray-50"
                  >
                    {tr("organizations.actions.invitations", "Invitations")}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
