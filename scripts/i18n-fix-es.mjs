import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const esPath = path.resolve(__dirname, '../src/i18n/es.json');

const exactReplacements = new Map([
  ['Dashboard Costos', 'Panel de costos'],
  ['Email', 'Correo'],
  ['Email:', 'Correo:'],
  ['Sign in', 'Iniciar sesión'],
  ['Sign in with magic link', 'Iniciar sesión con enlace mágico'],
  ['Invalid email.', 'Correo no válido.'],
  ['Could not send the link. Please try again.', 'No se pudo enviar el enlace. Inténtalo de nuevo.'],
  ['Go to dashboard', 'Ir al panel'],
  ['Tracker Dashboard', 'Panel de seguimiento'],
  ['Password', 'Contraseña'],
  ['Volver a Login', 'Volver a iniciar sesión'],
  ['Ir a Login', 'Ir a iniciar sesión'],
  ['Ir al login', 'Ir a iniciar sesión'],
  ['Volver al login', 'Volver a iniciar sesión'],
  ['Sin email', 'Sin correo'],
]);

const phraseReplacements = [
  [/Manage your staff with smart geofences anywhere in the world/gi, 'Gestiona tu personal con geocercas inteligentes en cualquier parte del mundo'],
  [/We sent you an access link\. Check your email\./gi, 'Te enviamos un enlace de acceso. Revisa tu correo.'],
  [/Important: access works only with the real Magic Link\./gi, 'Importante: el acceso funciona solo con el enlace mágico real.'],
  [/If you prefer, you can sign in using a Magic Link \(no password\)\./gi, 'Si lo prefieres, puedes iniciar sesión usando un enlace mágico (sin contraseña).'],
  [/If login is correct, the server redirects to \/auth\/callback with tokens\./gi, 'Si el inicio de sesión es correcto, el servidor redirige a /auth/callback con tokens.'],
  [/El dashboard de tracking requiere PRO o superior\./gi, 'El panel de seguimiento requiere PRO o superior.'],
  [/Error al cargar geocercas \(geofences\)\./gi, 'Error al cargar geocercas.'],
  [/Magic link enviado a/gi, 'Enlace mágico enviado a'],
  [/dashboard de costos/gi, 'panel de costos'],
  [/dashboard/gi, 'panel'],
  [/\blogin\b/gi, 'inicio de sesión'],
  [/\bemail\b/gi, 'correo'],
  [/\bpassword\b/gi, 'contraseña'],
  [/\btracking\b/gi, 'seguimiento'],
  [/\bupgrade\b/gi, 'mejora de plan'],
  [/\bBilling\b/g, 'Facturación'],
  [/\bMode: NO-JS \(native form submit\)\b/g, 'Modo: NO-JS (envío nativo del formulario)'],
  [/\bStable WebView\/TWA login: native submit \(no JS events\), anti rate-limit by design\./g, 'Inicio de sesión estable para WebView/TWA: envío nativo (sin eventos JS), con protección anti límite de frecuencia.'],
  [/\bLat\/Lng\b/g, 'Lat/Lng'],
];

function walk(node, visitor) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      node[i] = walk(node[i], visitor);
    }
    return node;
  }

  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      node[key] = walk(node[key], visitor);
    }
    return node;
  }

  return visitor(node);
}

function fixValue(value) {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();

  if (exactReplacements.has(trimmed)) {
    return exactReplacements.get(trimmed);
  }

  let next = value;

  for (const [pattern, replacement] of phraseReplacements) {
    next = next.replace(pattern, replacement);
  }

  return next;
}

function main() {
  if (!fs.existsSync(esPath)) {
    console.error(`File not found: ${esPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(esPath, 'utf8');
  const json = JSON.parse(raw);

  const fixed = walk(json, fixValue);

  fs.writeFileSync(esPath, `${JSON.stringify(fixed, null, 2)}\n`, 'utf8');

  console.log(`✅ es.json actualizado: ${esPath}`);
  console.log('Ahora corre:');
  console.log('node scripts/i18n-audit-es.mjs');
}

main();