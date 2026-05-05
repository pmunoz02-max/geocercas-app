// process-support-mailbox.mjs
// Safe-mode prototype for soporte@tugeocercas.com
// Lee emails simulados desde archivo JSON (--input), clasifica, genera borrador, asigna labels/escalamiento, nunca envía emails ni conecta correo real.

import fs from 'fs';

const CATEGORIES = [
  'login_access',
  'tracker_invite',
  'android_gps_tracking',
  'geofence_usage',
  'billing_payment',
  'pricing_sales',
  'privacy_legal',
  'security_access',
  'bug_report',
  'feature_request',
  'other',
];

const LABELS = [
  'AI/ready-to-review',
  'AI/needs-human',
  'AI/login',
  'AI/tracker',
  'AI/android',
  'AI/geofence',
  'AI/billing',
  'AI/pricing',
  'AI/privacy-legal',
  'AI/security',
  'AI/bug',
  'AI/feature-request',
  'AI/other',
  'AI/urgent',
];

// --- Argument parsing ---
let inputFile = null;
for (let i = 2; i < process.argv.length; ++i) {
  if (process.argv[i].startsWith('--input=')) {
    inputFile = process.argv[i].split('=')[1];
    break;
  }
  if (process.argv[i] === '--input' && process.argv[i + 1]) {
    inputFile = process.argv[i + 1];
    break;
  }
}
if (!inputFile) {
  console.error('Error: Debe especificar el archivo de emails simulados con --input=archivo.json');
  process.exit(1);
}
if (!fs.existsSync(inputFile)) {
  console.error(`Error: El archivo '${inputFile}' no existe.`);
  process.exit(1);
}

const simulatedEmails = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// --- Language detection (scoring ES/EN/FR) ---
function detectLanguage(text) {
  const langKeywords = {
    ES: [
      'no puedo','cuenta','acceso','correo','entrar','mensaje','gracias','empresa','organización','pago','factura','suscripción','cobro','reembolso','seguridad','otra','ver','datos','pantalla','blanca','geocerca','ubicación','android','tracker','invitación','rol','permiso','evento','mapa','eliminar','privacidad','legal','borrar'
    ],
    EN: [
      "can't",'sign in','account','link','never','please','organization','payment','invoice','subscription','charge','refund','security','other','see','data','blank screen','geofence','location','android','tracker','invite','role','permission','event','map','delete','privacy','legal','remove'
    ],
    FR: [
      'connexion','compte','accès','recevoir','lien','entreprise','organisation','paiement','facture','abonnement','prélèvement','remboursement','sécurité','autre','voir','données','écran','blanc','géofence','position','android','tracker','invitation','rôle','permission','événement','carte','supprimer','confidentialité','légal','effacer'
    ]
  };
  const scores = { ES: 0, EN: 0, FR: 0 };
  for (const [lang, words] of Object.entries(langKeywords)) {
    for (const w of words) {
      if (text.toLowerCase().includes(w)) scores[lang]++;
    }
  }
  // If tie, prefer ES > EN > FR
  const maxScore = Math.max(scores.ES, scores.EN, scores.FR);
  if (scores.ES === maxScore && maxScore > 0) return 'ES';
  if (scores.EN === maxScore && maxScore > 0) return 'EN';
  if (scores.FR === maxScore && maxScore > 0) return 'FR';
  return 'ES';
}

// --- Category classification (billing/security first, then android/geofence, tracker_invite only if invite/invitación/invitation) ---
function classifyCategory(text) {
  // Billing/security first
  if (/(pago|factura|suscripción|paddle|cobro|billing|refund|cancel|payment|invoice|subscription|charge|remboursement|paiement|facture|abonnement|prélèvement)/i.test(text)) return 'billing_payment';
  if (/(acceso indebido|otra organización|seguridad|security|unauthorized|autre organisation|sécurité|non autorisé)/i.test(text)) return 'security_access';
  // Android/geofence
  if (/(android|gps|ubicación|tracking|offline|permisos|position|permisión|le gps|reste offline)/i.test(text)) return 'android_gps_tracking';
  if (/(geocerca|geofence|perímetro|evento|mapa|boundary|géofence|événement|carte)/i.test(text)) return 'geofence_usage';
  // Tracker invite only if invite/invitación/invitation
  if (/(invitación|invite|invitation)/i.test(text)) return 'tracker_invite';
  // Login
  if (/(login|acceso|entrar|sign in|access link|connexion|compte)/i.test(text)) return 'login_access';
  // Pricing
  if (/(precio|plan|tarifa|pricing|oferta|enterprise|offre)/i.test(text)) return 'pricing_sales';
  // Privacy/legal
  if (/(privacidad|datos|gdpr|eliminar|terms|legal|delete|confidentialité|données|supprimer|légal|effacer)/i.test(text)) return 'privacy_legal';
  // Bug
  if (/(error|bug|falla|crash|pantalla blanca|no funciona|blank screen|écran blanc|ne fonctionne pas)/i.test(text)) return 'bug_report';
  // Feature
  if (/(sugerencia|feature|mejora|request|add|suggestion|amélioration)/i.test(text)) return 'feature_request';
  return 'other';
}

function assignPriority(category) {
  if (['billing_payment', 'privacy_legal', 'security_access'].includes(category)) return 'urgent';
  if (['tracker_invite', 'android_gps_tracking', 'bug_report', 'pricing_sales'].includes(category)) return 'high';
  return 'normal';
}

function assignConfidence(category) {
  if (['privacy_legal', 'security_access'].includes(category)) return 'baja';
  if (['billing_payment', 'bug_report', 'pricing_sales'].includes(category)) return 'media';
  return 'alta';
}

function assignLabels(category, priority, escalate) {
  const labels = [];
  switch (category) {
    case 'login_access': labels.push('AI/login'); break;
    case 'tracker_invite': labels.push('AI/tracker'); break;
    case 'android_gps_tracking': labels.push('AI/android','AI/tracker'); break;
    case 'geofence_usage': labels.push('AI/geofence'); break;
    case 'billing_payment': labels.push('AI/billing'); break;
    case 'pricing_sales': labels.push('AI/pricing'); break;
    case 'privacy_legal': labels.push('AI/privacy-legal'); break;
    case 'security_access': labels.push('AI/security'); break;
    case 'bug_report': labels.push('AI/bug'); break;
    case 'feature_request': labels.push('AI/feature-request'); break;
    case 'other': labels.push('AI/other'); break;
  }
  if (escalate) labels.push('AI/needs-human');
  else labels.push('AI/ready-to-review');
  if (priority === 'urgent') labels.push('AI/urgent');
  return labels;
}

function shouldEscalate(email, category, priority, confidence) {
  // Escala siempre si es billing, privacy/legal, security
  if (['billing_payment', 'privacy_legal', 'security_access', 'android_gps_tracking'].includes(category)) return true;
  // Escala tracker_invite si hay error después de aceptar invitación
  if (category === 'tracker_invite' &&
      /accepted.*(not|no|doesn'?t|does not|aparece|aparezco|no estoy|not showing|n’apparaît|n’apparais|pas dans|not in|no figura|no sale|no aparece|no se ve|no me veo|no me muestra|not listed|not visible|not found|not present|not assigned|not added|not included|not part|not member|not showing up|not appearing|not visible|not present|not assigned|not added|not included|not part|not member)/i.test(email.body)) {
    return true;
  }
  // Escala bug_report crítico
  if (category === 'bug_report' &&
      /(pantalla blanca|blank screen|crash|critical|crítico|crítica|no funciona|no se puede|no responde|no actualiza|no carga|no inicia|no arranca|no abre|no muestra|no responde|no actualiza|no carga|no inicia|no arranca|no abre|no muestra|perdida de datos|data loss|lost data|error grave|se pierde|se borra|se elimina|se desaparece|se pierde|se borra|se elimina|se desaparece)/i.test(email.body)) {
    return true;
  }
  // Escala si confianza baja o prioridad urgente
  if (confidence === 'baja' || priority === 'urgent') return true;
  return false;
}

function generateDraft(email, lang, category) {
  const templates = {
    ES: {
      login_access: 'Para acceder: Ingresa a la web oficial y usa tu correo registrado. Si el problema continúa, envíanos una captura del mensaje visible.',
      tracker_invite: 'Por favor acepta la invitación con el correo correcto y revisa tu rol en la organización.',
      billing_payment: 'Tu solicitud de facturación o reembolso será revisada manualmente. No se procesan pagos por email.',
      security_access: 'Hemos detectado un posible incidente de seguridad. Tu caso será revisado de inmediato por nuestro equipo.',
      geofence_usage: 'Para crear una geocerca, entra a la sección Geocercas y sigue los pasos indicados.',
      android_gps_tracking: 'Verifica que la app Android tenga permisos de ubicación y el GPS esté activo.',
      default: 'Hemos recibido tu mensaje y lo revisaremos pronto. Gracias por contactarnos.'
    },
    EN: {
      login_access: 'To access: Go to the official website and use your registered email. If the problem continues, please send us a screenshot of the visible message.',
      tracker_invite: 'Please accept the invitation with the correct email and check your role in the organization.',
      billing_payment: 'Your billing or refund request will be reviewed manually. Payments are not processed by email.',
      security_access: 'A possible security incident has been detected. Your case will be reviewed immediately by our team.',
      geofence_usage: 'To create a geofence, go to the Geofences section and follow the instructions.',
      android_gps_tracking: 'Check that the Android app has location permissions and GPS is active.',
      default: 'We have received your message and will review it soon. Thank you for contacting us.'
    },
    FR: {
      login_access: 'Pour accéder : Rendez-vous sur le site officiel et utilisez votre e-mail enregistré. Si le problème persiste, envoyez-nous une capture du message visible.',
      tracker_invite: 'Veuillez accepter l’invitation avec le bon e-mail et vérifier votre rôle dans l’organisation.',
      billing_payment: 'Votre demande de facturation ou de remboursement sera examinée manuellement. Aucun paiement n’est traité par e-mail.',
      security_access: 'Un incident de sécurité potentiel a été détecté. Votre cas sera examiné immédiatement par notre équipe.',
      geofence_usage: 'Pour créer une géofence, accédez à la section Géofences et suivez les instructions.',
      android_gps_tracking: 'Vérifiez que l’application Android dispose des autorisations de localisation et que le GPS est actif.',
      default: 'Nous avons bien reçu votre message et le traiterons prochainement. Merci de nous avoir contactés.'
    }
  };
  const t = templates[lang] || templates.ES;
  return t[category] || t.default;
}

const results = [];
for (const email of simulatedEmails) {
  const lang = detectLanguage(email.body);
  const category = classifyCategory(email.body);
  const priority = assignPriority(category);
  const confidence = assignConfidence(category);
  const escalate = shouldEscalate(email, category, priority, confidence);
  const labels = assignLabels(category, priority, escalate);
  const draft = generateDraft(email, lang, category);

  const result = {
    id: email.id,
    idioma: lang,
    categoria: category,
    prioridad: priority,
    confianza: confidence,
    labels,
    escala: escalate ? 'sí' : 'no',
    borrador: draft,
    enviado: false // never send
  };
  results.push(result);
}
console.log(JSON.stringify(results, null, 2));
