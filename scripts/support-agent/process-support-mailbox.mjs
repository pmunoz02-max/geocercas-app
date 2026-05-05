// process-support-mailbox.mjs
// Safe-mode prototype for soporte@tugeocercas.com
// Lee emails simulados desde archivo JSON (--input), clasifica, genera borrador, asigna labels/escalamiento, nunca envía emails ni conecta correo real.

import fs from 'fs';
import path from 'path';

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
let outFile = null;
let expectFile = null;
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--input=')) {
    inputFile = arg.slice('--input='.length);
    continue;
  }
  if (arg === '--input' && process.argv[i + 1]) {
    inputFile = process.argv[i + 1];
    i++;
    continue;
  }
  if (arg.startsWith('--out=')) {
    outFile = arg.slice('--out='.length);
    continue;
  }
  if (arg === '--out' && process.argv[i + 1]) {
    outFile = process.argv[i + 1];
    i++;
    continue;
  }
  if (arg.startsWith('--expect=')) {
    expectFile = arg.slice('--expect='.length);
    continue;
  }
  if (arg === '--expect' && process.argv[i + 1]) {
    expectFile = process.argv[i + 1];
    i++;
    continue;
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
      'no puedo','cuenta','acceso','correo','entrar','mensaje','gracias','empresa','organización','pago','factura','suscripción','cobro','reembolso','seguridad','otra','ver','datos','pantalla','blanca','geocerca','ubicación','android','tracker','invitación','rol','permiso','evento','mapa','eliminar','privacidad','legal','borrar','precio','plan','tarifa','soporte','ayuda','problema','error','sugerencia','mejora','agregar','añadir','whatsapp','contrato','descuento','oferta','reporte','exportar','excel'
    ],
    EN: [
      "can't",'cannot','unable','sign in','account','link','never','please','organization','payment','invoice','subscription','charge','refund','security','other','see','data','blank screen','geofence','location','android','tracker','invite','role','permission','event','map','delete','privacy','legal','remove','price','plan','rate','support','help','problem','issue','error','suggestion','feature','add','whatsapp','contract','discount','offer','report','export','excel','improvement','request','bug','crash',
      // Nuevos keywords login EN
      "can't sign in","cannot sign in","log in","login","access link","sign in",
      // Nuevos tracker_invite EN
      "invitation","accepted","not showing","role","not listed","not visible","not found","not present","not assigned","not added","not included","not part","not member",
      // Pricing EN
      "price","pricing","plan","plans","enterprise","quote","discount","invoice","company","team","teams"
    ],
    FR: [
      'connexion','compte','accès','recevoir','lien','entreprise','organisation','paiement','facture','abonnement','prélèvement','remboursement','sécurité','autre','voir','données','écran','blanc','géofence','position','android','tracker','invitation','rôle','permission','événement','carte','supprimer','confidentialité','légal','effacer','prix','forfait','tarif','soutien','aide','problème','erreur','suggestion','amélioration','ajouter','whatsapp','contrat','remise','offre','rapport','exporter','excel','demande','bug','crash',
      // Nuevos keywords billing FR
      'annuler','abonnement','remboursement','paiement','facturation','prélèvement',
      // Billing FR adicionales
      'facturé','facturée','facturation','deux fois','mois-ci','vérifier',
      // Frases clave para mejor detección FR
      "j'ai été","facturé","deux fois","ce mois-ci","pouvez-vous","vérifier",
      // Nuevos login FR
      "impossible d’accéder","impossible de se connecter",
      // Nuevos tracker_invite FR
      "invitation","a accepté","n’apparaît","autre rôle","n’apparais","pas dans","not in",
      // Pricing FR
      "tarif","tarifs","forfait","forfaits","prix","abonnement","entreprise","équipe","équipes","devis",
      // Billing FR extra
      "facturé","vérifier"
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

// --- Category classification (estricto: billing > security > privacy > android > bug crítico > geofence > tracker_invite > login > pricing > feature > other) ---
function classifyCategory(text) {
  // 1. Billing (FR: annuler, résilier, abonnement, remboursement, paiement, facturation, prélèvement, facturé, vérifier)
  if (/(pago|factura|suscripción|cancelar|reembolso|paddle|cobro|cobrado|cobrado dos veces|cobraron|cobro doble|facturación incorrecta|factura incorrecta|billing|refund|cancel|payment|invoice|subscription|charge|paiement|facture|abonnement|annuler|résilier|remboursement|facturation|prélèvement|facturé|vérifier)/i.test(text)) return 'billing_payment';
  // 2. Security
  if (/(acceso indebido|otra organización|seguridad|security|unauthorized|autre organisation|sécurité|non autorisé|acceso sospechoso|acceso no autorizado|not authorized|not allowed|see.*other organization|see.*other company|voir.*autre organisation|voir.*autre entreprise)/i.test(text)) return 'security_access';
  // 3. Privacy/legal
  if (/(privacidad|datos|gdpr|eliminar|terms|legal|delete|confidentialité|données|supprimer|légal|effacer|privacy|data|remove|erase|borrar|proteger|protección|protection|protéger)/i.test(text)) return 'privacy_legal';
  // 4. Android GPS tracking (gana sobre bug si aparecen ambos)
  if (/(android|gps|tracking|offline|ubicación|posición|position|localisation|autorisation|permissions|ne met plus à jour|no actualiza)/i.test(text)) return 'android_gps_tracking';
  // 5. Feature request antes que bug si hay intención de mejora (ES/EN/FR)
  if (/(sería bueno|agregar|añadir|pueden agregar|whatsapp|feature request|feature|suggestion|add|could you add|can you add|ajouter|amélioration|pouvez-vous ajouter|exportar|export|excel|mejora|improvement|it would be great|ce serait utile|suggestion d'amélioration|sugerencia de mejora|sería útil|utile de|serait utile|serait bon|serait bien|serait intéressant)/i.test(text)) {
    return 'feature_request';
  }
  // 6. Bug crítico (más estricto, antes de geofence)
  if (/(pantalla blanca|blank screen|écran blanc|crash|no carga|does not load|ne se charge pas|reportes no cargan|reports do not load|rapports ne se chargent pas|error crítico|critical error|se cierra sola|app se cierra|application se ferme|app closes|application closes|app crashes|application crashes)/i.test(text)) return 'bug_report';
  // 7. Geofence simple después de bug crítico
  if (/(geocerca|geofence|géofence|perímetro|perimeter|périmètre|evento|event|événement|mapa|map|carte|enter|exit)/i.test(text)) {
    return 'geofence_usage';
  }
  // 8. Tracker invite (invitación, invitado, acepté, tracker, rol, invite, invitation, accepted, not showing, role, rôle, a accepté, n’apparaît, autre rôle)
  if (/(invitación|invitado|acept[ée]|tracker|rol|invite|invitation|accepted|not showing|role|rôle|a accepté|n’apparaît|autre rôle)/i.test(text)) return 'tracker_invite';
  // 9. Login (EN: can't sign in, cannot sign in, log in, login, access link, sign in)
  if (/(login|acceso|entrar|sign in|access link|connexion|compte|no puedo acceder|can’t log in|can’t access|cannot log in|cannot access|impossible d’accéder|impossible de se connecter|can\'t sign in|cannot sign in|log in)/i.test(text)) return 'login_access';
  // 10. Pricing
  if (/(precio|plan|tarifa|pricing|oferta|enterprise|offre|contrato|contract|discount|descuento|facturación|factura|invoice|cotización|quote|presupuesto|budget|coste|cost|fee|tarif|tarifs|tarifa|tarifas|plans|rates|rate|pricing|price|prices|precios|plans|plan|abono|abonement|abonnement|abonnements|abonnement|abonnements|plan|plans|enterprise|corporate|business|negocio|empresa|empresarial|corporativo|corporate|business|negocio|empresa|empresarial|corporativo)/i.test(text)) return 'pricing_sales';
  // 11. Other
  return 'other';
}

function assignPriority(category, email) {
  // billing_payment, privacy_legal, security_access: urgent
  if (["billing_payment", "privacy_legal", "security_access"].includes(category)) return "urgent";
  // android_gps_tracking: high
  if (category === "android_gps_tracking") return "high";
  // tracker_invite con problema: high
  if (category === "tracker_invite") return "high";
  // bug crítico: urgent
  if (category === "bug_report") return "urgent";
  // pricing_sales enterprise/contrato/factura/descuento: high
  if (category === "pricing_sales" && /(enterprise|contrato|contract|factura|invoice|descuento|discount|corporate|business|negocio|empresa|empresarial|corporativo)/i.test(email.body)) return "high";
  // feature_request: low
  if (category === "feature_request") return "low";
  // pricing_sales simple: normal
  if (category === "pricing_sales") return "normal";
  return "normal";
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
  if (escalate) {
    labels.push('AI/needs-human');
  } else {
    labels.push('AI/ready-to-review');
  }
  if (priority === 'urgent') labels.push('AI/urgent');
  return labels;
}

function shouldEscalate(email, category, priority, confidence) {
  // Escala siempre si es billing, privacy/legal, security, android
  if (["billing_payment", "privacy_legal", "security_access", "android_gps_tracking"].includes(category)) return true;
  // Escala tracker_invite si hay problema de rol o no aparece, o si dice accepted invite + doesn't appear/dashboard
    if (
      category === 'tracker_invite' &&
      /(rol|role|rôle|administrador|admin|owner|propietario|rol incorrecto|otro rol|rol diferente|wrong role|different role|mauvais rôle|autre rôle|no aparece|no se muestra|no figura|no sale|no lo veo|no me veo|not showing|doesn't appear|does not appear|not visible|not listed|not in my dashboard|n’apparaît|n'apparait|ne s’affiche pas|ne s'affiche pas|acepté|acepto|aceptado|accepted|accepté|a accepté)/i.test(email.body)
    ) {
      return true;
    }
  // Escala bug_report crítico
  if (category === "bug_report" &&
    /(pantalla blanca|blank screen|écran blanc|crash|no carga|does not load|ne se charge pas|reportes no cargan|reports do not load|rapports ne se chargent pas|error crítico|critical error|se cierra sola|app se cierra|application se ferme|app closes|application closes|app crashes|application crashes)/i.test(email.body)) {
    return true;
  }
  // Escala si confianza baja o prioridad urgente
  if (confidence === "baja" || priority === "urgent") return true;
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
  const priority = assignPriority(category, email);
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

const outputJson = JSON.stringify(results, null, 2);
console.log(outputJson);

if (outFile) {
  const dir = path.dirname(outFile);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outFile, outputJson + '\n', 'utf8');
}

// --- Expectation check ---
if (expectFile) {
  if (!fs.existsSync(expectFile)) {
    console.error(`Error: El archivo de resultados esperados '${expectFile}' no existe.`);
    process.exit(1);
  }
  const expected = JSON.parse(fs.readFileSync(expectFile, 'utf8'));
  let pass = true;
  if (!Array.isArray(expected) || expected.length !== results.length) {
    console.error('FAIL: El número de resultados no coincide con el esperado.');
    pass = false;
  } else {
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const e = expected[i];
      // Compare fields
      const fields = ['id','idioma','categoria','prioridad','escala','enviado'];
      for (const f of fields) {
        if (r[f] !== e[f]) {
          console.error(`FAIL: Caso ${r.id} campo '${f}' esperado='${e[f]}' obtenido='${r[f]}'`);
          pass = false;
        }
      }
      // Compare labels as sets
      const rLabels = Array.isArray(r.labels) ? [...r.labels].sort() : [];
      const eLabels = Array.isArray(e.labels) ? [...e.labels].sort() : [];
      if (rLabels.length !== eLabels.length || rLabels.some((v, idx) => v !== eLabels[idx])) {
        console.error(`FAIL: Caso ${r.id} labels esperado=${JSON.stringify(eLabels)} obtenido=${JSON.stringify(rLabels)}`);
        pass = false;
      }
    }
  }
  if (pass) {
    console.log('PASS: Todos los resultados coinciden con los esperados.');
  } else {
    process.exit(1);
  }
}
