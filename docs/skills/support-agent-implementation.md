# Diseño técnico — Prototipo seguro agente soporte@tugeocercas.com

## Casilla principal
- soporte@tugeocercas.com

## Proveedor técnico opcional
- Gmail API / Google Workspace (recomendado por integración y seguridad)
- Alternativamente, cualquier proveedor compatible con IMAP/SMTP seguro

## Modo inicial
- Safe/manual: El agente solo lee, clasifica, crea borradores y aplica labels. Nunca envía, archiva ni borra emails.
- Todas las acciones requieren revisión y envío manual por un humano autorizado.

## Flujo técnico seguro
1. Leer emails no procesados
   - Conectarse a soporte@tugeocercas.com usando Gmail API (OAuth2) o IMAP seguro.
   - Filtrar solo emails sin labels de procesamiento (AI/done, AI/ready-to-review, AI/needs-human).
2. Clasificar email
   - Detectar idioma (ES/EN/FR) y categoría principal.
   - Asignar prioridad y confianza.
3. Crear borrador de respuesta
   - Generar borrador seguro usando templates oficiales.
   - No enviar automáticamente.
   - Antes de crear, verificar que no exista ya un borrador para ese email (evitar duplicados).
4. Aplicar labels
   - Asignar AI/ready-to-review o AI/needs-human según reglas de clasificación y escalamiento.
   - Nunca aplicar AI/done automáticamente.
5. Restricciones críticas
   - Nunca enviar emails automáticamente.
   - Nunca archivar ni borrar emails.
   - Nunca aplicar AI/done sin revisión humana.
   - No modificar, reenviar ni eliminar emails originales.
   - No tocar Producción ni datos reales fuera de la casilla de soporte.
   - Todo procesamiento debe ser auditable y reversible.

## Notas de seguridad
- El agente nunca debe pedir contraseñas, tokens, códigos privados ni exponer datos internos.
- El workflow debe actualizarse si cambian las reglas de negocio, escalamiento o templates.
- Toda acción debe ser reversible y dejar registro para auditoría.

## Resumen visual
1. Leer emails nuevos (no procesados)
2. Clasificar y analizar
3. Crear borrador seguro (si no existe)
4. Aplicar labels (AI/ready-to-review o AI/needs-human)
5. Esperar revisión y envío manual

> En ningún caso el agente envía, archiva, borra ni aplica AI/done automáticamente. Nunca toca Producción fuera de la casilla de soporte.

## Validación y pruebas automatizadas

- **Cobertura de casos:**
  - 30 emails simulados: 10 en español (ES), 10 en inglés (EN), 10 en francés (FR).
  - Casos cubren: login, tracker, Android GPS, geocercas, billing, pricing, privacidad/legal, security_access, bugs y feature_request.
- **Archivos de validación:**
  - `sample-emails.json`: emails de entrada simulados.
  - `expected-results.json`: resultados esperados alineados con categorías, prioridades, labels y escalamiento.
- **Comandos de validación:**
  - `npm run support:agent:test` — Ejecuta la validación principal:
    ```sh
    node geocercas-app/scripts/support-agent/process-support-mailbox.mjs --input geocercas-app/scripts/support-agent/sample-emails.json --expect geocercas-app/scripts/support-agent/expected-results.json
    ```
  - `npm run support:agent:sim` — Simula procesamiento y permite salida custom:
    ```sh
    node geocercas-app/scripts/support-agent/process-support-mailbox.mjs --input geocercas-app/scripts/support-agent/sample-emails.json --out resultado-simulado.json
    ```
    - O bien, para comparar contra expected:
    ```sh
    node geocercas-app/scripts/support-agent/process-support-mailbox.mjs --input geocercas-app/scripts/support-agent/sample-emails.json --out resultado-simulado.json --expect geocercas-app/scripts/support-agent/expected-results.json
    ```
- **Safe-mode validado:**
  - Todas las reglas de clasificación, escalamiento y generación de borradores se validan automáticamente contra los 30 casos.
  - El agente nunca envía, archiva ni borra emails en modo seguro.
  - Los resultados deben coincidir exactamente con los archivos de expected para pasar la validación.
