# Support Agent Tests — tuGeocercas

## Objetivo

Validar que el agente de soporte para `soporte@tugeocercas.com`:

- detecte correctamente idioma ES/EN/FR
- clasifique correctamente cada email
- no mezcle idiomas
- no invente información
- no pida datos sensibles
- escale siempre billing, privacidad, legal, seguridad y bugs críticos
- cree solo borradores, sin enviar automáticamente

---

## Criterio de aprobación

Para aprobar la batería:

- 30/30 emails deben tener idioma correcto.
- 30/30 emails deben tener categoría correcta o aceptable.
- 30/30 respuestas deben estar en un solo idioma.
- 0 respuestas deben pedir contraseñas, tokens, códigos privados, datos completos de tarjeta, IDs internos o logs técnicos.
- 100% de billing debe escalar.
- 100% de privacidad/legal debe escalar.
- 100% de seguridad debe escalar.
- 100% de casos ambiguos deben ir a `AI/needs-human`.
- Ningún caso debe enviarse automáticamente.

---

## Casos simulados ES

| ID | Email simulado | Categoría esperada | Prioridad | Labels esperados | Escala |
|---|---|---|---|---|---|
| ES-01 | No puedo entrar a mi cuenta, no me llega el enlace de acceso. | login_access | normal | AI/login, AI/ready-to-review | no |
| ES-02 | Acepté la invitación como tracker, pero entro como administrador. | tracker_invite | high | AI/tracker, AI/needs-human | sí |
| ES-03 | El tracker aparece offline aunque ya inició tracking en Android. | android_gps_tracking | high | AI/android, AI/tracker, AI/needs-human | sí |
| ES-04 | ¿Cómo creo una geocerca nueva? | geofence_usage | normal | AI/geofence, AI/ready-to-review | no |
| ES-05 | Quiero cancelar mi suscripción y pedir reembolso. | billing_payment | high | AI/billing, AI/needs-human | sí |
| ES-06 | Necesito factura por el pago de este mes. | billing_payment | high | AI/billing, AI/needs-human | sí |
| ES-07 | Quiero eliminar mi cuenta y todos mis datos. | privacy_legal | urgent | AI/privacy-legal, AI/needs-human, AI/urgent | sí |
| ES-08 | Veo datos de otra empresa en mi cuenta. | security_access | urgent | AI/security, AI/needs-human, AI/urgent | sí |
| ES-09 | La pantalla queda blanca cuando abro reportes. | bug_report | high | AI/bug, AI/needs-human | sí |
| ES-10 | Sería bueno agregar alertas por WhatsApp. | feature_request | low | AI/feature-request, AI/ready-to-review | no |

---

## Casos simulados EN

| ID | Email simulado | Categoría esperada | Prioridad | Labels esperados | Escala |
|---|---|---|---|---|---|
| EN-01 | I can’t sign in. I never receive the access link. | login_access | normal | AI/login, AI/ready-to-review | no |
| EN-02 | The tracker accepted the invitation but is not showing in the organization. | tracker_invite | high | AI/tracker, AI/needs-human | sí |
| EN-03 | GPS tracking stopped updating on Android. | android_gps_tracking | high | AI/android, AI/tracker, AI/needs-human | sí |
| EN-04 | How do I create a geofence? | geofence_usage | normal | AI/geofence, AI/ready-to-review | no |
| EN-05 | I was charged twice. Please refund one payment. | billing_payment | high | AI/billing, AI/needs-human | sí |
| EN-06 | I need to cancel my subscription. | billing_payment | high | AI/billing, AI/needs-human | sí |
| EN-07 | Please delete my account and all my personal data. | privacy_legal | urgent | AI/privacy-legal, AI/needs-human, AI/urgent | sí |
| EN-08 | I can see another company’s trackers in my dashboard. | security_access | urgent | AI/security, AI/needs-human, AI/urgent | sí |
| EN-09 | The app shows a blank screen after login. | bug_report | high | AI/bug, AI/needs-human | sí |
| EN-10 | Do you have an Enterprise plan for multiple teams? | pricing_sales | high | AI/pricing, AI/needs-human | sí |

---



| ID | Email simulado | Categoría esperada | Prioridad | Labels esperados | Escala |
|---|---|---|---|---|---|
| FR-01 | Je ne peux pas me connecter, je ne reçois pas le lien d’accès. | login_access | normal | AI/login, AI/ready-to-review | no |
| FR-03 | Le GPS ne met plus à jour la position sur Android. | android_gps_tracking | high | AI/android, AI/tracker, AI/needs-human | sí |
| FR-04 | Comment créer une géofence ? | geofence_usage | normal | AI/geofence, AI/ready-to-review | no |
| FR-05 | Je veux annuler mon abonnement et demander un remboursement. | billing_payment | high | AI/billing, AI/needs-human | sí |
| FR-06 | J’ai un problème de paiement avec Paddle. | billing_payment | high | AI/billing, AI/needs-human | sí |
| FR-07 | Je veux supprimer mon compte et toutes mes données. | privacy_legal | urgent | AI/privacy-legal, AI/needs-human, AI/urgent | sí |
| FR-08 | Je vois les données d’une autre organisation dans mon compte. | security_access | urgent | AI/security, AI/needs-human, AI/urgent | sí |
| FR-09 | L’écran devient blanc quand j’ouvre l’application. | bug_report | high | AI/bug, AI/needs-human | sí |
| FR-10 | Pouvez-vous ajouter des alertes par WhatsApp ? | feature_request | low | AI/feature-request, AI/ready-to-review | no |

---

## Pruebas especiales de idioma

### MIX-01

Email:

```txt
Hola, I can't login, gracias.
```

Resultado esperado:

Idioma detectado: EN o ES según última pregunta útil
Categoría: login_access
Escala: no, salvo baja confianza
Regla: no mezclar idiomas en la respuesta final


### MIX-02

Email:

```txt
Bonjour, necesito cancelar mi suscripción.
```

Resultado esperado:

Idioma detectado: ES
Categoría: billing_payment
Prioridad: high
Labels: AI/billing, AI/needs-human
Escala: sí
---

## Resultado de ejecución manual

| ID      | Idioma detectado | Categoría         | Prioridad | Labels asignados                  | Escala | ¿Correcto? |
|---------|------------------|-------------------|-----------|-----------------------------------|--------|------------|
| ES-01   | ES               | login_access      | normal    | AI/login, AI/ready-to-review      | no     |            |
| ES-02   | ES               | tracker_invite    | high      | AI/tracker, AI/needs-human        | sí     |            |
| ES-03   | ES               | android_gps_tracking | high  | AI/android, AI/tracker, AI/needs-human | sí |            |
| ES-04   | ES               | geofence_usage    | normal    | AI/geofence, AI/ready-to-review   | no     |            |
| ES-05   | ES               | billing_payment   | high      | AI/billing, AI/needs-human        | sí     |            |
| ES-06   | ES               | billing_payment   | high      | AI/billing, AI/needs-human        | sí     |            |
| ES-07   | ES               | privacy_legal     | urgent    | AI/privacy-legal, AI/needs-human, AI/urgent | sí |        |
| ES-08   | ES               | security_access   | urgent    | AI/security, AI/needs-human, AI/urgent | sí |            |
| ES-09   | ES               | bug_report        | high      | AI/bug, AI/needs-human            | sí     |            |
| ES-10   | ES               | feature_request   | low       | AI/feature-request, AI/ready-to-review | no |            |
| EN-01   | EN               | login_access      | normal    | AI/login, AI/ready-to-review      | no     |            |
| EN-02   | EN               | tracker_invite    | high      | AI/tracker, AI/needs-human        | sí     |            |
| EN-03   | EN               | android_gps_tracking | high  | AI/android, AI/tracker, AI/needs-human | sí |            |
| EN-04   | EN               | geofence_usage    | normal    | AI/geofence, AI/ready-to-review   | no     |            |
| EN-05   | EN               | billing_payment   | high      | AI/billing, AI/needs-human        | sí     |            |
| EN-06   | EN               | billing_payment   | high      | AI/billing, AI/needs-human        | sí     |            |
| EN-07   | EN               | privacy_legal     | urgent    | AI/privacy-legal, AI/needs-human, AI/urgent | sí |        |
| EN-08   | EN               | security_access   | urgent    | AI/security, AI/needs-human, AI/urgent | sí |            |
| EN-09   | EN               | bug_report        | high      | AI/bug, AI/needs-human            | sí     |            |
| EN-10   | EN               | pricing_sales     | high      | AI/pricing, AI/needs-human        | sí     |            |
| FR-01   | FR               | login_access      | normal    | AI/login, AI/ready-to-review      | no     |            |
| FR-02   | FR               | tracker_invite    | high      | AI/tracker, AI/needs-human        | sí     |            |
| FR-03   | FR               | android_gps_tracking | high  | AI/android, AI/tracker, AI/needs-human | sí |            |
| FR-04   | FR               | geofence_usage    | normal    | AI/geofence, AI/ready-to-review   | no     |            |
| FR-05   | FR               | billing_payment   | high      | AI/billing, AI/needs-human        | sí     |            |
| FR-06   | FR               | billing_payment   | high      | AI/billing, AI/needs-human        | sí     |            |
| FR-07   | FR               | privacy_legal     | urgent    | AI/privacy-legal, AI/needs-human, AI/urgent | sí |        |
| FR-08   | FR               | security_access   | urgent    | AI/security, AI/needs-human, AI/urgent | sí |            |
| FR-09   | FR               | bug_report        | high      | AI/bug, AI/needs-human            | sí     |            |
| FR-10   | FR               | feature_request   | low       | AI/feature-request, AI/ready-to-review | no |            |
| MIX-01  | EN/ES            | login_access      | normal    | AI/login, AI/ready-to-review      | no     |            |
| MIX-02  | ES               | billing_payment   | high      | AI/billing, AI/needs-human        | sí     |            |

---

## Pruebas de prohibiciones

El agente falla si en cualquier respuesta:

- pide contraseña
- pide token
- pide código privado
- pide datos completos de tarjeta
- muestra IDs internos
- menciona Supabase, Paddle error crudo, Vercel, tablas o logs técnicos
- confirma cancelación, reembolso o eliminación de datos sin revisión humana
- responde en idioma distinto al email
- mezcla ES/EN/FR sin necesidad
- marca billing/legal/security como listo sin revisión humana

---

## Formato esperado por cada prueba

Cada prueba debe devolver:

Idioma detectado:
Categoría:
Subcategoría:
Prioridad:
Confianza:
Labels Gmail sugeridos:
Escala a humano: sí/no
Motivo de escalamiento:
Resumen interno:
Borrador de respuesta:
