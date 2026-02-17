// scripts/i18n-add-forgot-keys.mjs
// Adds i18n keys for ForgotPassword page into ES + EN locale files.
// Safe + idempotent (won't overwrite existing keys).
//
// Run (PowerShell):
//   node .\scripts\i18n-add-forgot-keys.mjs
//
// Optional env override:
//   $env:LOCALES_DIR="src/i18n"

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LOCALES_DIR = process.env.LOCALES_DIR
  ? (path.isAbsolute(process.env.LOCALES_DIR) ? process.env.LOCALES_DIR : path.join(ROOT, process.env.LOCALES_DIR))
  : path.join(ROOT, "src", "i18n");

const ES_PATH = path.join(LOCALES_DIR, "es.json");
const EN_PATH = path.join(LOCALES_DIR, "en.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function deepMergeNoOverwrite(target, source) {
  // merges source into target without overwriting existing scalar keys
  for (const [k, v] of Object.entries(source)) {
    if (!(k in target)) {
      target[k] = v;
      continue;
    }
    const tv = target[k];
    if (isObject(tv) && isObject(v)) {
      deepMergeNoOverwrite(tv, v);
    }
    // if target has scalar or array, do not overwrite
  }
  return target;
}

function ensureFileExists(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing locale file: ${p}`);
  }
}

function main() {
  ensureFileExists(ES_PATH);
  ensureFileExists(EN_PATH);

  const es = readJson(ES_PATH);
  const en = readJson(EN_PATH);

  const forgotES = {
    forgot: {
      back: "Volver a Login",
      title: "Restablecer contraseña",
      subtitle: "Te enviaremos un enlace para crear una nueva contraseña. Si no te llega, revisa SPAM.",
      tip: "Tip: si el enlace falla, genera uno nuevo y ábrelo en una ventana de incógnito.",
      email: "Correo",
      emailPh: "tu@correo.com",
      sending: "Enviando…",
      send: "Enviar enlace",
      noteTitle: "Nota",
      noteDesc:
        "El enlace entrará por /auth/callback y te enviará a /reset-password para crear la nueva contraseña.",
      errorEmail: "Ingresa un correo válido.",
      errorGeneric: "No se pudo enviar el correo.",
      success:
        "✅ Si el correo existe, te llegará un enlace para crear una nueva contraseña. Revisa SPAM y ábrelo en el mismo navegador."
    }
  };

  const forgotEN = {
    forgot: {
      back: "Back to Login",
      title: "Reset password",
      subtitle: "We will send you a link to create a new password. If it doesn't arrive, check SPAM.",
      tip: "Tip: if the link fails, generate a new one and open it in an incognito window.",
      email: "Email",
      emailPh: "you@email.com",
      sending: "Sending…",
      send: "Send link",
      noteTitle: "Note",
      noteDesc:
        "The link will go through /auth/callback and then redirect you to /reset-password to set the new password.",
      errorEmail: "Enter a valid email.",
      errorGeneric: "Could not send the email.",
      success:
        "✅ If the email exists, you will receive a link to create a new password. Check SPAM and open it in the same browser."
    }
  };

  deepMergeNoOverwrite(es, forgotES);
  deepMergeNoOverwrite(en, forgotEN);

  writeJson(ES_PATH, es);
  writeJson(EN_PATH, en);

  console.log("✅ Added forgot.* keys to:");
  console.log("— ES:", ES_PATH);
  console.log("— EN:", EN_PATH);
  console.log("ℹ️ No existing keys were overwritten.");
}

main();
