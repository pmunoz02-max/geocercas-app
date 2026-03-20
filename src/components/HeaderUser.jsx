// src/components/HeaderUser.jsx
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import { useUserProfile } from "../hooks/useUserProfile";
import { Link } from "react-router-dom";
import React, { useState, useRef, useEffect } from "react";

export default function HeaderUser() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const { profile, loading, err, refresh } = useUserProfile();

  return (
    <header className="w-full border-b bg-white/60 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="font-semibold">{t("app.brand")}</span>
        </div>

        <div className="flex items-center gap-3">
          {loading ? (
            <span className="text-sm text-gray-500">{t("common.actions.loading")}</span>
          ) : err ? (
            <span className="text-sm text-red-600">
              {t("auth.errorTitle", { defaultValue: "Error" })}: {err}
            </span>
          ) : profile ? (
            <DropdownUser
              profile={profile}
              t={t}
              signOut={signOut}
              refresh={refresh}
            />
          ) : (
            <span className="text-sm text-gray-500">{t("common.fallbacks.noAuth")}</span>
          )}
        </div>
      // DropdownUser: user block as dropdown menu
      function DropdownUser({ profile, t, signOut, refresh }) {
        const [open, setOpen] = useState(false);
        const triggerRef = useRef(null);
        const menuRef = useRef(null);

        // Close dropdown on click outside
        useEffect(() => {
          if (!open) return;
          function handleClick(e) {
            if (
              menuRef.current && !menuRef.current.contains(e.target) &&
              triggerRef.current && !triggerRef.current.contains(e.target)
            ) {
              setOpen(false);
            }
          }
          document.addEventListener("mousedown", handleClick);
          return () => document.removeEventListener("mousedown", handleClick);
        }, [open]);

        // Close dropdown on menu item click
        function handleMenuClick(action) {
          setOpen(false);
          if (action === "logout") signOut();
        }

        return (
          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              className="flex flex-col leading-tight text-left focus:outline-none focus:ring-2 focus:ring-slate-400 rounded"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="true"
              aria-expanded={open}
            >
              <span className="text-sm">
                {profile.email ?? t("common.fallbacks.noEmail")}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full border">
                  {t("home.labels.role", { defaultValue: "Rol:" })} {profile.rol ?? t("common.roles.noRole")}
                </span>
                {profile.org_id && (
                  <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-gray-50 border">
                    {t("app.header.organizationLabel", { defaultValue: "Org" })}: {String(profile.org_id).slice(0, 8)}...
                  </span>
                )}
              </div>
            </button>
            {open && (
              <div
                ref={menuRef}
                className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 shadow-lg rounded-xl z-50 py-2"
              >
                <Link
                  to="/account"
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded"
                  onClick={() => handleMenuClick()}
                >
                  {t("app.header.account", { defaultValue: "Account" })}
                </Link>
                <Link
                  to="/billing"
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded"
                  onClick={() => handleMenuClick()}
                >
                  {t("app.header.billing", { defaultValue: "Billing" })}
                </Link>
                <button
                  type="button"
                  className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded"
                  onClick={() => handleMenuClick("logout")}
                >
                  {t("app.header.logout")}
                </button>
              </div>
            )}
            <button
              onClick={refresh}
              title={t("common.refreshContext", { defaultValue: "Refrescar" })}
              className="ml-2 text-sm border rounded px-3 py-1 hover:bg-gray-50"
            >
              {t("common.refreshContext", { defaultValue: "Refrescar" })}
            </button>
          </div>
        );
      }
      </div>
    </header>
  );
}

