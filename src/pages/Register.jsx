import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../App";

export default function Register() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const tt = (key, fallback, options = {}) =>
    t(key, { defaultValue: fallback, ...options });

  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    setInfoMsg("");

    try {
      const email = form.email.trim();
      const password = form.password;
      const name = form.name.trim();

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name || "" },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        setErrorMsg(
          error.message ||
            tt("register.errors.signUpFailed", "Could not complete registration.")
        );
        return;
      }

      if (data?.user && !data?.session) {
        setInfoMsg(
          tt(
            "register.messages.checkEmail",
            "Registration completed. Check your email to confirm the account."
          )
        );
        return;
      }

      navigate("/", { replace: true });
    } catch (err) {
      setErrorMsg(
        err?.message ||
          tt("register.errors.unexpected", "Unexpected error while creating the account.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: "40px auto" }}>
      <h2>{tt("register.title", "Create account")}</h2>

      <form onSubmit={handleRegister} style={{ display: "grid", gap: 12 }}>
        <label>
          {tt("register.nameLabel", "Name (optional)")}
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={onChange}
            placeholder={tt("register.namePlaceholder", "Your name")}
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          {tt("register.emailLabel", "Email")}
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={onChange}
            placeholder={tt("register.emailPlaceholder", "you@email.com")}
            required
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          {tt("register.passwordLabel", "Password")}
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={onChange}
            placeholder={tt("register.passwordPlaceholder", "Minimum 6 characters")}
            required
            minLength={6}
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        {errorMsg && <div style={{ color: "crimson", fontSize: 14 }}>{errorMsg}</div>}
        {infoMsg && <div style={{ color: "seagreen", fontSize: 14 }}>{infoMsg}</div>}

        <button type="submit" disabled={submitting} style={{ padding: 10 }}>
          {submitting
            ? tt("register.submitting", "Creating…")
            : tt("register.submit", "Create account")}
        </button>
      </form>

      <div style={{ marginTop: 12, fontSize: 14 }}>
        {tt("register.haveAccount", "Already have an account?")}{" "}
        <Link to="/login">{tt("register.loginLink", "Sign in")}</Link>
      </div>
    </div>
  );
}
