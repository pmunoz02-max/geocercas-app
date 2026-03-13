// src/pages/DeleteAccountPage.jsx
import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/auth.js";
import { supabase } from "../supabaseClient";

export default function DeleteAccountPage() {
  const navigate = useNavigate();
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

  const canSubmit =
    !!userId &&
    confirmChecked &&
    confirmText.trim().toUpperCase() === "DELETE" &&
    !submitting &&
    !success;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!authenticated || !userId) {
      setErrorMsg("No active authenticated user was found.");
      return;
    }

    if (!confirmChecked || confirmText.trim().toUpperCase() !== "DELETE") {
      setErrorMsg('Please confirm and type "DELETE" to continue.');
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
      setErrorMsg(err?.message || "Could not create deletion request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-5">
          <h1 className="text-2xl font-bold text-slate-900">Delete account</h1>
          <p className="mt-2 text-sm text-slate-600">
            Request permanent deletion of your App Geocercas account and associated data.
          </p>
        </div>

        <div className="px-6 py-6 space-y-6">
          <section className="rounded-xl border border-red-200 bg-red-50 p-4">
            <h2 className="text-sm font-semibold text-red-800">Warning</h2>
            <p className="mt-2 text-sm text-red-700">
              Deleting your account is permanent and cannot be undone.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-900">What will be deleted</h2>
            <ul className="mt-3 list-disc pl-5 space-y-1 text-sm text-slate-700">
              <li>User account information</li>
              <li>Personal profile data</li>
              <li>Tracker assignments</li>
              <li>GPS location records</li>
              <li>Geofences created by the account</li>
              <li>Activity logs related to the account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-900">Retention note</h2>
            <p className="mt-2 text-sm text-slate-700">
              Some limited data may be temporarily retained when required for legal
              compliance, fraud prevention, or security purposes.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-900">Processing time</h2>
            <p className="mt-2 text-sm text-slate-700">
              Account deletion requests are processed within 30 days of receiving the request.
              Once completed, the account and associated data cannot be recovered.
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-900">Account</h2>
            <p className="mt-2 text-sm text-slate-700">
              Signed in as: <span className="font-medium">{email || "Unknown user"}</span>
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
                I understand that this action is permanent and my account data cannot be recovered.
              </span>
            </label>

            <div>
              <label htmlFor="delete-confirm" className="block text-sm font-medium text-slate-800">
                Type <span className="font-bold">DELETE</span> to confirm
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
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
                Your deletion request has been received. Your account and associated data will be removed within 30 days.
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Submitting..." : "Request account deletion"}
              </button>

              <Link
                to="/inicio"
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>

              <a
                href="/delete-account"
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-slate-600 underline underline-offset-2"
              >
                View public deletion policy
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}