// src/pages/DeleteAccountPage.jsx
import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";
import { supabase } from "../supabaseClient";

export default function DeleteAccountPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, profile, role, currentRole, authenticated } = useAuth();

  const [confirmChecked, setConfirmChecked] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [success, setSuccess] = useState(false);

  const email = useMemo(
    () => user?.email || profile?.email || "",
    [user, profile]
  );

  const userId = useMemo(
    () => user?.id || profile?.user_id || null,
    [user, profile]
  );

  const deleteKeyword = "DELETE";

  const canSubmit =
    !!userId &&
    confirmChecked &&
    confirmText.trim().toUpperCase() === deleteKeyword &&
    !submitting &&
    !success;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!authenticated || !userId) {
      setErrorMsg(
        t("deleteAccount.errors.noAuthenticatedUser", {
          defaultValue: "No active authenticated user was found.",
        })
      );
      return;
    }

    if (!confirmChecked || confirmText.trim().toUpperCase() !== deleteKeyword) {
      setErrorMsg(
        t("deleteAccount.errors.confirmationRequired", {
          defaultValue: 'Please confirm and type "DELETE" to continue.',
        })
      );
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        user_id: userId,
        email: email || null,
        requested_by: userId,
        status: "pending",
        source: "in_app",
        notes: `Role: ${String(role || currentRole || "").toLowerCase() || "unknown"}`,
      };

      const { error } = await supabase
        .from("account_deletion_requests")
        .insert([payload]);

      if (error) {
        throw error;
      }

      setSuccess(true);

      try {
        await supabase.auth.signOut();
      } catch (signOutErr) {
        console.warn("[DeleteAccountPage] signOut warning:", signOutErr);
      }

      setTimeout(() => {
        navigate("/", { replace: true });
      }, 1600);
    } catch (err) {
      console.error("[DeleteAccountPage] request error:", err);
      setErrorMsg(
        err?.message ||
          t("deleteAccount.errors.requestFailed", {
            defaultValue: "Could not create deletion request.",
          })
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-5">
          <h1 className="text-2xl font-bold text-slate-900">
            {t("deleteAccount.title", { defaultValue: "Delete account" })}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {t("deleteAccount.subtitle", {
              defaultValue:
                "Request permanent deletion of your App Geocercas account and associated data.",
            })}
          </p>
        </div>

        <div className="px-6 py-6 space-y-6">
          <section className="rounded-xl border border-red-200 bg-red-50 p-4">
            <h2 className="text-sm font-semibold text-red-800">
              {t("deleteAccount.warning.title", { defaultValue: "Warning" })}
            </h2>
            <p className="mt-2 text-sm text-red-700">
              {t("deleteAccount.warning.body", {
                defaultValue:
                  "Deleting your account is permanent and cannot be undone.",
              })}
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-900">
              {t("deleteAccount.whatWillBeDeleted.title", {
                defaultValue: "What will be deleted",
              })}
            </h2>
            <ul className="mt-3 list-disc pl-5 space-y-1 text-sm text-slate-700">
              <li>
                {t("deleteAccount.whatWillBeDeleted.items.accountInfo", {
                  defaultValue: "User account information",
                })}
              </li>
              <li>
                {t("deleteAccount.whatWillBeDeleted.items.profileData", {
                  defaultValue: "Personal profile data",
                })}
              </li>
              <li>
                {t("deleteAccount.whatWillBeDeleted.items.trackerAssignments", {
                  defaultValue: "Tracker assignments",
                })}
              </li>
              <li>
                {t("deleteAccount.whatWillBeDeleted.items.gpsRecords", {
                  defaultValue: "GPS location records",
                })}
              </li>
              <li>
                {t("deleteAccount.whatWillBeDeleted.items.geofences", {
                  defaultValue: "Geofences created by the account",
                })}
              </li>
              <li>
                {t("deleteAccount.whatWillBeDeleted.items.activityLogs", {
                  defaultValue: "Activity logs related to the account",
                })}
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-900">
              {t("deleteAccount.retention.title", {
                defaultValue: "Retention note",
              })}
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              {t("deleteAccount.retention.body", {
                defaultValue:
                  "Some limited data may be temporarily retained when required for legal compliance, fraud prevention, or security purposes.",
              })}
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-900">
              {t("deleteAccount.processingTime.title", {
                defaultValue: "Processing time",
              })}
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              {t("deleteAccount.processingTime.body", {
                defaultValue:
                  "Account deletion requests are processed within 30 days of receiving the request. Once completed, the account and associated data cannot be recovered.",
              })}
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-900">
              {t("deleteAccount.account.title", { defaultValue: "Account" })}
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              {t("deleteAccount.account.signedInAs", {
                defaultValue: "Signed in as:",
              })}{" "}
              <span className="font-medium">
                {email ||
                  t("deleteAccount.account.unknownUser", {
                    defaultValue: "Unknown user",
                  })}
              </span>
            </p>
          </section>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
              />
              <span className="text-sm text-slate-700">
                {t("deleteAccount.confirmCheckbox", {
                  defaultValue:
                    "I understand that this action is permanent and my account data cannot be recovered.",
                })}
              </span>
            </label>

            <div>
              <label
                htmlFor="delete-confirm"
                className="block text-sm font-medium text-slate-800"
              >
                {t("deleteAccount.confirmInputLabel", {
                  defaultValue: "Type DELETE to confirm",
                })}
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={t("deleteAccount.confirmKeyword", {
                  defaultValue: "DELETE",
                })}
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
              />
            </div>

            {errorMsg ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMsg}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {t("deleteAccount.successMessage", {
                  defaultValue:
                    "Your deletion request has been received. Your account and associated data will be removed within 30 days.",
                })}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className={canSubmit
                  ? "px-4 py-2 rounded-xl font-semibold text-sm transition border border-red-600 bg-red-600 text-white hover:bg-red-700"
                  : "px-4 py-2 rounded-xl font-semibold text-sm transition border !border-red-300 !bg-red-100 !text-red-700 cursor-not-allowed !opacity-100"
                }
              >
                {submitting
                  ? t("deleteAccount.submitting", {
                      defaultValue: "Submitting...",
                    })
                  : t("deleteAccount.submitButton", {
                      defaultValue: "Request account deletion",
                    })}
              </button>
              {!canSubmit && (
                <p className="text-xs text-slate-500 mt-2">
                  Debes cancelar tu suscripción antes de eliminar la cuenta
                </p>
              )}

              <Link
                to="/inicio"
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Link>

              <a
                href="/delete-account"
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-slate-600 underline underline-offset-2"
              >
                {t("deleteAccount.publicPolicyLink", {
                  defaultValue: "View public deletion policy",
                })}
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}