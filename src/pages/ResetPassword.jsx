// src/pages/ResetPassword.jsx
// RESET-PASSWORD-IMPLICIT-V2
// Soporta 2 entrada:
// A) Implicit recovery: /reset-password#access_token=...&refresh_token=...&type=recovery
// B) Legacy token_hash: /reset-password?token_hash=...&type=recovery  (verifyOtp)

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { useNavigate, useSearchParams } from "react-router-dom";

function isStrongEnough(pw) {
  const s = String(pw || "");
  return s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

function parseHashParams(hash) {
  const h = (hash || "").startsWith("#") ? hash.slice(1) : hash || "";
  const sp = new URLSearchParams(h);
  return {
    access_token: sp.get("access_token") || "",
    refresh_token: sp.get("refresh_token") || "",
    type: (sp.get("type") || "").toLowerCase(),
    error: sp.get("error") || sp.get("error_description") || "",
  };
}

export default function ResetPassword() {
  const { t } = useTranslation();
  const tr = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token_hash = searchParams.get("token_hash") || "";
  const type_q = (searchParams.get("type") || "").toLowerCase();

  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type, text }

  const canSubmit = useMemo(() => {
    if (!password || !password2) return false;
    if (password !== password2) return false;
    return isStrongEnough(password);
  }, [password, password2]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setChecking(true);
      setReady(false);
      setMsg(null);

      try {
        const h = parseHashParams(window.location.hash || "");
        if (h.error) {
          setMsg({
            type: "error",
            text: tr(
              "resetPassword.errors.invalidOrExpiredLink",
              "The recovery link is invalid or expired. Generate a new one."
            ),
          });
          setReady(false);
          return;
        }

        if (h.access_token && (h.type === "recovery" || h.type === "magiclink")) {
          const { error } = await supabase.auth.setSession({
            access_token: h.access_token,
            refresh_token: h.refresh_token || "",
          });

          if (cancelled) return;

          if (error) {
            setMsg({
              type: "error",
              text: tr(
                "resetPassword.errors.couldNotStartRecoverySession",
                "Could not start the recovery session. Generate a new link and try again in incognito mode."
              ),
            });
            setReady(false);
            return;
          }

          try {
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch {}

          setReady(true);
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (session?.user?.id) {
          setReady(true);
          return;
        }

        if (token_hash && (type_q || "recovery")) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type_q || "recovery",
          });

          if (cancelled) return;

          if (error || !data?.session?.user?.id) {
            setMsg({
              type: "error",
              text: tr(
                "resetPassword.errors.invalidOrExpiredLink",
                "The recovery link is invalid or expired. Generate a new one."
              ),
            });
            setReady(false);
            return;
          }

          setReady(true);
          return;
        }

        setMsg({
          type: "error",
          text: tr(
            "resetPassword.errors.noRecoverySession",
            "There is no recovery session. Request a new recovery link."
          ),
        });
        setReady(false);
      } catch (e) {
        if (cancelled) return;
        setMsg({
          type: "error",
          text: e?.message || tr("resetPassword.errors.unexpected", "Unexpected error."),
        });
        setReady(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [token_hash, type_q, t]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (!canSubmit) {
      setMsg({
        type: "warn",
        text: tr(
          "resetPassword.errors.passwordRequirements",
          "Check your password: minimum 8 characters, includes letters and numbers, and both entries must match."
        ),
      });
      return;
    }

    try {
      setBusy(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setMsg({
          type: "error",
          text: tr(
            "resetPassword.errors.noActiveSessionForPasswordChange",
            "There is no active session to change the password. Open the recovery link again or generate a new one."
          ),
        });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMsg({
          type: "error",
          text: error.message || tr("resetPassword.errors.updateFailed", "Could not update."),
        });
        return;
      }

      setMsg({
        type: "success",
        text: tr(
          "resetPassword.messages.updated",
          "✅ Password updated. You can now sign in."
        ),
      });

      await supabase.auth.signOut().catch(() => {});
      setTimeout(() => navigate("/login", { replace: true }), 900);
    } catch (e2) {
      setMsg({
        type: "error",
        text: e2?.message || tr("resetPassword.errors.unexpected", "Unexpected error."),
      });
    } finally {
      setBusy(false);
    }
  }

  const msgClass =
    msg?.type === "success"
      ? "text-emerald-700"
      : msg?.type === "warn"
      ? "text-amber-700"
      : "text-red-600";

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border rounded-2xl p-6">
        <h1 className="text-xl font-semibold mb-2">
          {tr("resetPassword.title", "Reset password")}
        </h1>
        <p className="text-sm text-slate-600 mb-4">
          {tr(
            "resetPassword.description",
            "Enter a new password for your account."
          )}
        </p>

        {checking ? (
          <div className="text-sm text-slate-600">
            {tr("resetPassword.states.verifyingLink", "Verifying link…")}
          </div>
        ) : !ready ? (
          <div className="space-y-3">
            {msg ? <div className={`text-sm ${msgClass}`}>{msg.text}</div> : null}
            <button
              className="w-full bg-slate-900 text-white rounded-lg px-4 py-2 text-sm"
              onClick={() => navigate("/login", { replace: true })}
            >
              {tr("resetPassword.actions.goToLogin", "Go to Login")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {tr("resetPassword.newPasswordLabel", "New password")}
              </label>
              <input
                type="password"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tr(
                  "resetPassword.newPasswordPlaceholder",
                  "Min. 8 characters, letters and numbers"
                )}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {tr("resetPassword.repeatPasswordLabel", "Repeat password")}
              </label>
              <input
                type="password"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder={tr(
                  "resetPassword.repeatPasswordPlaceholder",
                  "Repeat the password"
                )}
              />
            </div>

            {msg ? <div className={`text-sm ${msgClass}`}>{msg.text}</div> : null}

            <button
              disabled={busy}
              className="w-full bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-60"
            >
              {busy
                ? tr("resetPassword.actions.saving", "Saving…")
                : tr("resetPassword.actions.saveNewPassword", "Save new password")}
            </button>

            <div className="text-[11px] text-slate-500">
              {tr(
                "resetPassword.tip",
                "Tip: if it fails, generate a new link and open it in incognito mode."
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}