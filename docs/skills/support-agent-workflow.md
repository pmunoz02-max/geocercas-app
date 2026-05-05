# Workflow técnico — Agente de soporte (soporte@tugeocercas.com)

## Objetivo

Describir el flujo técnico que debe seguir el agente de soporte para operar sobre la casilla de soporte@tugeocercas.com, garantizando seguridad, trazabilidad y cumplimiento de reglas de escalamiento. El proveedor de correo puede ser Gmail u otro compatible, pero el workflow es independiente del proveedor.

---

## Modo inicial seguro

- El agente inicia siempre en modo solo-lectura y solo puede crear borradores y aplicar labels, nunca enviar respuestas automáticas.
- No debe modificar, reenviar ni eliminar emails originales.

## Regla anti-duplicados

- Antes de procesar un email, verificar que no tenga ya labels de procesamiento (AI/done, AI/ready-to-review, AI/needs-human) para evitar duplicidad.
- Si un email ya tiene alguno de estos labels, omitirlo del workflow.

## Pasos del workflow

1. **Leer emails nuevos**
   - Acceder a la bandeja de entrada de soporte@tugeocercas.com mediante API segura (por ejemplo, Gmail API, OAuth2, IMAP, etc.).
   - Filtrar solo emails no procesados (sin label AI/done ni AI/ready-to-review ni AI/needs-human).

2. **Clasificar email**
   - Detectar idioma principal (ES/EN/FR) del último mensaje útil.
   - Analizar el contenido y clasificar en una sola categoría principal (login_access, tracker_invite, android_gps_tracking, geofence_usage, billing_payment, pricing_sales, privacy_legal, security_access, bug_report, feature_request, other).
   - Asignar prioridad (low, normal, high, urgent) y confianza (alta, media, baja).

3. **Crear borrador de respuesta**
   - Generar un borrador seguro usando los templates oficiales y reglas de idioma.
   - No incluir información inventada ni datos sensibles.
   - No enviar el email automáticamente.

4. **Aplicar labels**
   - Asignar los labels sugeridos según la clasificación:
     - AI/ready-to-review, AI/needs-human, AI/login, AI/tracker, AI/android, AI/geofence, AI/billing, AI/pricing, AI/privacy-legal, AI/security, AI/bug, AI/feature-request, AI/other, AI/done, AI/urgent.
   - Regla: Nunca aplicar AI/done automáticamente. AI/security siempre va con AI/needs-human. Casos security_access siempre escalan.

5. **Escalar si corresponde**
   - Si el caso es complejo, riesgoso, involucra billing, privacidad, legal, seguridad, acceso indebido, datos de otra organización, baja confianza o solicitud irreversible, marcar para revisión humana (AI/needs-human) y NO enviar respuesta.
   - Dejar registro del motivo de escalamiento en el resumen interno.

6. **Finalizar procesamiento**
   - Marcar el email como procesado solo si se creó borrador y se aplicaron labels.
   - No enviar ningún email automáticamente. Todo borrador debe ser revisado y enviado manualmente por un humano autorizado.

---

## Aclaración sobre AI/done

- El label AI/done nunca debe ser aplicado automáticamente por el agente.
- Solo un humano autorizado puede marcar un caso como AI/done tras revisión manual y envío seguro.

## Notas
- El agente nunca debe pedir contraseñas, tokens, códigos privados ni exponer datos internos.
- Todo procesamiento debe ser auditable y reversible.
- El workflow debe actualizarse si cambian las reglas de negocio, escalamiento o templates.
