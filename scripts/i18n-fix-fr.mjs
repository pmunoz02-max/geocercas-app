#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FR_PATH = path.join(ROOT, "src", "i18n", "fr.json");

// Opcional: si quieres aplicar también a ES/EN:
// const ES_PATH = path.join(ROOT, "src", "i18n", "es.json");
// const EN_PATH = path.join(ROOT, "src", "i18n", "en.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function getByPath(obj, dotted) {
  const parts = dotted.split(".");
  let cur = obj;
  for (const p of parts) {
    if (!isObject(cur)) return undefined;
    cur = cur[p];
    if (typeof cur === "undefined") return undefined;
  }
  return cur;
}

function setByPath(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    const k = parts[i];
    const isLast = i === parts.length - 1;
    if (isLast) {
      cur[k] = value;
      return;
    }
    if (!isObject(cur[k])) cur[k] = {};
    cur = cur[k];
  }
}

// ✅ Arreglo de mojibake común (Windows/CP1252 <-> UTF-8 mal interpretado)
function fixMojibake(s) {
  if (typeof s !== "string") return s;

  // Reemplazos típicos vistos en tu output
  const map = [
    ["Ã¡", "á"], ["Ã©", "é"], ["Ã­", "í"], ["Ã³", "ó"], ["Ãº", "ú"],
    ["Ã", "Á"], ["Ã‰", "É"], ["Ã", "Í"], ["Ã“", "Ó"], ["Ãš", "Ú"],
    ["Ã±", "ñ"], ["Ã‘", "Ñ"],
    ["Ã¼", "ü"], ["Ãœ", "Ü"],
    ["â€¦", "…"],
    ["â€™", "’"],
    ["â€œ", "“"], ["â€", "”"],
    ["â€“", "–"], ["â€”", "—"],
    ["â†’", "→"]
  ];

  let out = s;
  for (const [a, b] of map) out = out.split(a).join(b);

  // También arregla el caso de "Â " (espacios raros)
  out = out.split("Â ").join(" ");

  return out;
}

function deepMapStrings(node, fn) {
  if (typeof node === "string") return fn(node);
  if (Array.isArray(node)) return node.map((x) => deepMapStrings(x, fn));
  if (isObject(node)) {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = deepMapStrings(v, fn);
    return out;
  }
  return node;
}

function main() {
  if (!fs.existsSync(FR_PATH)) {
    console.error(`❌ No existe: ${FR_PATH}`);
    process.exit(1);
  }

  const fr = readJson(FR_PATH);

  // 1) Normaliza mojibake en TODO el archivo
  const frFixed = deepMapStrings(fr, fixMojibake);

  // 2) Inserta/asegura keys faltantes con FR real (las 21 + login.advancedOptions)
  //    (Ojo: tus placeholders estaban en ES y con mojibake, aquí ya va FR correcto)
  const missingFR = {
    "login.advancedOptions": "Options avancées",

    "asignaciones.filters.refresh": "Actualiser",
    "asignaciones.filters.refreshLoading": "Mise à jour…",

    "asignaciones.form.buttonCancel": "Annuler",
    "asignaciones.form.buttonCreate": "Créer une affectation",
    "asignaciones.form.buttonUpdate": "Mettre à jour l’affectation",

    "asignaciones.error.load": "Erreur lors du chargement des affectations.",
    "asignaciones.error.save": "Impossible d’enregistrer l’affectation.",
    "asignaciones.error.delete": "Impossible de supprimer l’affectation.",
    "asignaciones.error.missingPerson": "Vous devez sélectionner une personne.",
    "asignaciones.error.missingGeofence": "Vous devez sélectionner un géorepère.",
    "asignaciones.error.missingStart": "Vous devez saisir la date/heure de début.",
    "asignaciones.error.missingEnd": "Vous devez saisir la date/heure de fin.",

    "asignaciones.messages.catalogError": "Erreur lors du chargement des catalogues (personnel, géorepères, activités).",
    "asignaciones.messages.createSuccess": "Affectation créée avec succès.",
    "asignaciones.messages.createGenericError": "Impossible de créer l’affectation.",
    "asignaciones.messages.updateSuccess": "Affectation mise à jour avec succès.",
    "asignaciones.messages.updateGenericError": "Impossible de mettre à jour l’affectation.",
    "asignaciones.messages.deleteSuccess": "Affectation supprimée avec succès.",
    "asignaciones.messages.frequencyInvalidRange": "La fréquence doit être comprise entre 5 minutes et 12 heures.",
    "asignaciones.messages.overlapError": "La personne a déjà une affectation active qui se chevauche sur cette période."
  };

  for (const [k, v] of Object.entries(missingFR)) {
    if (typeof getByPath(frFixed, k) === "undefined") {
      setByPath(frFixed, k, v);
    }
  }

  // 3) Overrides críticos: claves que tu reporte marcó como EN dentro de FR (Login/Landing/Header)
  const overrides = {
    // Header
    "app.header.login": "Se connecter",
    "app.header.logout": "Se déconnecter",
    "app.header.goToPanel": "Aller au tableau de bord",

    // Common
    "common.createOrganization": "Créer une organisation",
    "common.orgNamePlaceholder": "Nom de l’organisation (ex. Ferme A)",
    "common.refreshContext": "Rafraîchir le contexte",

    // Landing usado en /login
    "landing.ctaLogin": "Aller au tableau de bord",
    "landing.ctaMagic": "Entrer avec un lien magique",
    "landing.loginButton": "Entrer",
    "landing.logout": "Se déconnecter",
    "landing.footerPrivacy": "Confidentialité",
    "landing.footerSupport": "Support",
    "landing.privacyMiniNote": "Confidentialité : la localisation est utilisée uniquement pour les fonctions de géorepères et de suivi, selon les autorisations accordées par l’utilisateur.",

    // Login
    "login.title": "Se connecter",
    "login.submit": "Entrer",
    "login.errorMissingEmail": "Vous devez saisir un e-mail.",
    "login.errors.invalidEmail": "Saisissez une adresse e-mail valide.",
    "login.goToDashboard": "Aller au tableau de bord",
    "login.loadingSession": "Chargement de votre session…",
    "login.magicDescription": "Nous vous enverrons un lien sécurisé par e-mail afin de vous connecter sans mot de passe.",
    "login.magicLinkDescription": "Nous vous enverrons un lien sécurisé par e-mail afin de vous connecter sans mot de passe.",
    "login.magicLinkTitle": "Entrer avec un lien magique",
    "login.passwordLoginButton": "Entrer avec un mot de passe",
    "login.passwordPlaceholder": "Saisissez votre mot de passe",

    // Reportes label
    "reportes.errorLabel": "Erreur :",

    // Reset password
    "resetPassword.subtitle": "Créez un nouveau mot de passe pour votre compte.",
    "resetPassword.saveButton": "Enregistrer le nouveau mot de passe",
    "resetPassword.success": "Mot de passe mis à jour avec succès. Vous pouvez maintenant vous connecter.",
    "resetPassword.backHome": "Aller à l’accueil",
    "resetPassword.tip": "Astuce : revenez à /login, saisissez votre e-mail et utilisez « Mot de passe oublié ? » pour générer un nouveau lien."
  };

  for (const [k, v] of Object.entries(overrides)) {
    setByPath(frFixed, k, v);
  }

  writeJson(FR_PATH, frFixed);

  console.log("✅ fr.json actualizado: mojibake arreglado + keys faltantes + overrides críticos FR.");
  console.log("📌 Siguiente: corre de nuevo el auditor y revisa 'Untranslated candidates' para iterar.");
}

main();
