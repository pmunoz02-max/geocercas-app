/**
 * Merge help/support + help/changelog keys into existing i18n JSON files.
 * Usage:
 *   node tools/mergeHelpI18n.mjs
 *
 * It will update:
 *   src/i18n/es.json
 *   src/i18n/en.json
 *   src/i18n/fr.json
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const files = [
  { lang: "es", file: "src/i18n/es.json" },
  { lang: "en", file: "src/i18n/en.json" },
  { lang: "fr", file: "src/i18n/fr.json" },
];

const patches = {
  es: {
    help: {
      support: {
        title: "Soporte",
        subtitle: "Contáctanos para soporte técnico, dudas de facturación o capacitación.",
        emailLabel: "Correo de soporte",
        notConfigured: "El contacto de soporte aún no está configurado."
      },
      changelog: {
        title: "Novedades / Changelog",
        subtitle: "Historial de cambios, mejoras y correcciones.",
        badges: {
          feature: "Función",
          fix: "Corrección",
          improvement: "Mejora"
        },
        items: [
          {
            version: "v1.0.0",
            date: "2026-02-03",
            changes: [
              {
                type: "feature",
                title: "Centro de ayuda",
                details: [
                  "Guía rápida, FAQ, soporte y changelog disponibles."
                ]
              },
              {
                type: "improvement",
                title: "Privacidad y cumplimiento",
                details: [
                  "Página pública de Política de Privacidad.",
                  "Correo de soporte configurable por variables de entorno."
                ]
              }
            ]
          }
        ]
      }
    }
  },
  en: {
    help: {
      support: {
        title: "Support",
        subtitle: "Contact us for technical support, billing questions, or onboarding.",
        emailLabel: "Support email",
        notConfigured: "Support contact is not configured yet."
      },
      changelog: {
        title: "Updates / Changelog",
        subtitle: "Change history, improvements, and fixes.",
        badges: {
          feature: "Feature",
          fix: "Fix",
          improvement: "Improvement"
        },
        items: [
          {
            version: "v1.0.0",
            date: "2026-02-03",
            changes: [
              {
                type: "feature",
                title: "Help center",
                details: [
                  "Quick guide, FAQ, support, and changelog available."
                ]
              },
              {
                type: "improvement",
                title: "Privacy & compliance",
                details: [
                  "Public Privacy Policy page.",
                  "Support email configurable via environment variables."
                ]
              }
            ]
          }
        ]
      }
    }
  },
  fr: {
    help: {
      support: {
        title: "Support",
        subtitle: "Contactez-nous pour le support technique, la facturation ou l’onboarding.",
        emailLabel: "E-mail de support",
        notConfigured: "Le contact support n’est pas encore configuré."
      },
      changelog: {
        title: "Nouveautés / Changelog",
        subtitle: "Historique des changements, améliorations et corrections.",
        badges: {
          feature: "Fonctionnalité",
          fix: "Correction",
          improvement: "Amélioration"
        },
        items: [
          {
            version: "v1.0.0",
            date: "2026-02-03",
            changes: [
              {
                type: "feature",
                title: "Centre d’aide",
                details: [
                  "Guide rapide, FAQ, support et changelog disponibles."
                ]
              },
              {
                type: "improvement",
                title: "Confidentialité & conformité",
                details: [
                  "Page publique de Politique de confidentialité.",
                  "E-mail de support configurable via variables d’environnement."
                ]
              }
            ]
          }
        ]
      }
    }
  }
};

function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

// Deep merge: arrays are replaced, objects merged
function deepMerge(target, patch) {
  if (!isObject(target) || !isObject(patch)) return patch;
  for (const [k, v] of Object.entries(patch)) {
    if (isObject(v)) {
      target[k] = deepMerge(isObject(target[k]) ? target[k] : {}, v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

for (const f of files) {
  const fullPath = path.join(ROOT, f.file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing file: ${f.file}`);
    process.exitCode = 1;
    continue;
  }
  const raw = fs.readFileSync(fullPath, "utf8");
  const data = JSON.parse(raw);
  const merged = deepMerge(data, patches[f.lang]);

  fs.writeFileSync(fullPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
  console.log(`Updated: ${f.file}`);
}

console.log("Done.");
