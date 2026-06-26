---

## Estado actual (2026-05-01)

- Asignaciones operativas: la lÃ³gica de asignaciÃ³n y sincronizaciÃ³n estÃ¡ activa y funcional.
- `tracker_assignments` es un espejo runtime de las asignaciones activas, actualizado automÃ¡ticamente por el backend.
- `tracker_positions` es la fuente de datos para el dashboard y reportes de posiciones.
- El endpoint `invite-tracker` bloquea la invitaciÃ³n si `personal.user_id` es null (no permite invitar sin usuario enlazado).

### ActualizaciÃ³n Preview â€” Tracker pairing codes (2026-06-04)

- Nuevo flujo Preview documentado en [docs/tracker-onboarding.md](docs/tracker-onboarding.md).
- Arquitectura validada: Magic Link como identidad mÃ­nima, pairing code para emparejar organizaciÃ³n/persona/tracker, y runtime token opaco para GPS.
- Tabla DB: `tracker_pairing_codes`.
- RPCs validadas en Supabase Preview con prueba transaccional y `ROLLBACK`:
  - `rpc_create_tracker_pairing_code`
  - `rpc_claim_tracker_pairing_code`
- Estado: DB/RPCs validadas en Preview.
- Pendiente: API admin, API tracker, UI admin, UI tracker y validaciÃ³n Android end-to-end en Preview.
- No promover a Production hasta orden explÃ­cita.

### Nuevos alias de rutas para geocercas (web)

- `/geofences` ahora redirige a `/geocercas`.
- `/new-geofence` y `/nueva-geocerca` ahora redirigen a `/geocerca`.
- Estos cambios aplican solo a la web. No hubo cambios en la base de datos, API ni Android.

### Nuevos alias de rutas de detalle de geocerca (web)

- `/geocercas/:id` y `/geofences/:id` ahora abren la vista VerGeocerca.
- Esto es solo para la web. No afecta la base de datos, API, Android ni producciÃ³n.

### ActualizaciÃ³n de pÃ¡gina de geocercas (web)

- Las rutas `/geocercas` y `/geofences` ahora usan la pÃ¡gina moderna de mapa Geocercas.jsx.
- GeocercasList.jsx es legacy y no estÃ¡ activa.
- Este cambio es solo para la web; no afecta base de datos, API, Android ni producciÃ³n.

### Página pública de recursos (web)

- Las rutas públicas `/resources`, `/recursos` y `/ressources` muestran la página `ResourcesPage.jsx`.
- La carpeta `public/resources/` queda reservada para archivos estáticos reales servidos por la web pública.
- Si un recurso no existe todavía, la UI debe mostrar `Próximamente` y no enlazar a archivos o videos ficticios.
- No subir a producción videos pesados ni placeholders externos.
- La página de recursos también aparece como pestaña interna para usuarios autenticados, usando `/recursos`, `/resources` o `/ressources` según idioma.


arquitectura vigente
servicio vÃ¡lido: ForegroundLocationService
entry point: WebViewActivity
deep link vÃ¡lido: /tracker-accept
carpeta _deprecated no usar para implementar

---

## Nota de cierre

El flujo completo de invitaciÃ³n de tracker, onboarding Android GeoField GPS y envÃ­o de posiciones quedÃ³ validado en producciÃ³n (`app.tugeocercas.com`) usando Google Play Internal Testing.

## Nota (mayo 2026)

- El listado de geocercas ahora recibe el campo `area_m2`, calculado en el backend/PostGIS mediante la funciÃ³n `list_geofences_with_area_preview`.
- En la interfaz de NuevaGeocerca, se muestra el Ã¡rea de cada geocerca y se permite elegir la unidad de Ã¡rea (mÂ², ha, kmÂ² o acres), persistiendo la preferencia del usuario en `localStorage`.
- El Ã¡rea canÃ³nica de cada geocerca se calcula exclusivamente en el backend; el frontend solo realiza la conversiÃ³n y formato para visualizaciÃ³n, pero no calcula el Ã¡rea.
- La funciÃ³n `list_geofences_with_area_preview` ahora tambiÃ©n devuelve `centroid_lat` y `centroid_lng`, calculados en PostGIS con `ST_PointOnSurface(geom)`. El componente NuevaGeocerca utiliza este punto interno representativo para mostrar Lat/Lng, garantizando que siempre estÃ© dentro del polÃ­gono, lo cual es Ãºtil incluso para geocercas con linderos irregulares.

### Ajuste Preview â€” lÃ­mite Vercel Hobby y pairing API (2026-06-04)

- Para respetar el lÃ­mite de Serverless Functions del plan Vercel Hobby, no se usa un endpoint nuevo `/api/tracker-pairing-code`.
- La creaciÃ³n admin de pairing code queda integrada en `api/invite-tracker.js` mediante `action: "create_pairing_code"`.
- Se elimina `api/tracker-pairing-code.js`.
- Se elimina `api/health.js` para dejar margen bajo el lÃ­mite de funciones.
- Estado actual: solo create pairing code en API Preview.
- Reclamar pairing code, UI admin, UI tracker y validaciÃ³n Android end-to-end siguen pendientes.
- No promover a Production hasta orden explÃ­cita.

### Ajuste Preview â€” claim pairing code API (2026-06-05)

- Se integra la acciÃ³n tracker `claim_pairing_code` dentro de `api/accept-tracker-invite.js`.
- No se crea un endpoint nuevo para evitar superar el lÃ­mite de Serverless Functions de Vercel Hobby.
- La acciÃ³n espera un tracker autenticado por Magic Link y un `pairing_code`.
- La validaciÃ³n llama a `rpc_claim_tracker_pairing_code`.
- Si el cÃ³digo es vÃ¡lido, devuelve runtime token opaco para continuar el flujo GPS.
- Estado: API implementada en Preview; pendiente validar endpoint en Deploy Preview y luego crear UI tracker.
- No promover a Production hasta orden explÃ­cita.

### Ajuste Preview â€” UI admin pairing code (2026-06-05)

- Se agregÃ³ en `src/pages/InvitarTracker.jsx` una secciÃ³n admin para generar y copiar cÃ³digos de emparejamiento.
- La UI llama a `POST /api/invite-tracker` con `action: "create_pairing_code"`.
- El flujo anterior de invitaciÃ³n por email no se reemplaza ni se elimina.
- Estado: UI admin implementada en Preview; pendiente validar visualmente en Deploy Preview.
- Pendiente siguiente: UI tracker para ingresar cÃ³digo despuÃ©s de Magic Link.
- No promover a Production hasta orden explÃ­cita.

### Ajuste Preview â€” UI tracker pairing code (2026-06-05)

- Se agregÃ³ en `src/pages/TrackerInviteStart.jsx` una secciÃ³n para que el tracker ingrese un cÃ³digo de emparejamiento despuÃ©s de iniciar sesiÃ³n con Magic Link.
- La UI llama a `POST /api/accept-tracker-invite` con `action: "claim_pairing_code"`.
- Si el cÃ³digo es vÃ¡lido, se reutiliza el flujo existente que persiste `tracker_runtime_token`, `tracker_user_id` y `org_id`.
- DespuÃ©s del claim exitoso, el tracker es redirigido a `/tracker-gps`.
- No se creÃ³ endpoint nuevo.
- Estado: UI tracker implementada en Preview; pendiente validar en Deploy Preview y Android end-to-end.
- No promover a Production hasta orden explÃ­cita.




### Actualización Dodo Payments aprobado (2026-06-25)

- Dodo Payments aprobó la cuenta de FENICE ECUADOR S.A.S.
- Live payments y payouts quedaron habilitados.
- Se crearon y validaron visualmente productos TEST:
  - Geocercas GPS PRO — USD 29/month.
  - Geocercas GPS Enterprise — USD 99/month.
- No se debe activar checkout live en producción todavía.
- No tocar Android, API keys ni webhooks live.
- La base de datos interna sigue siendo la fuente de verdad del plan.
- Ver `docs/dodo-payments-approval.md`.

### Cierre Preview — página pública de precios y checkout Dodo TEST (2026-06-26)

- `/pricing` y `/precios` muestran la nueva página React con PRO y Enterprise.
- PRO abre checkout TEST por USD 29/month.
- Enterprise abre checkout TEST por USD 99/month.
- Se corrigió el conflicto con `public/pricing/index.html`; una carga directa o incógnito ya no muestra la página legacy.
- La configuración permanece proveedor-agnóstica y centralizada.
- El retorno desde Dodo vuelve temporalmente a `/pricing` hasta crear rutas `/billing/return`, `/billing/success` y `/billing/cancel`.
- No se agregaron API keys, webhooks, SQL, cambios Android ni checkout LIVE.
- Producción no fue modificada por esta fase.
- Documento canónico: `docs/DODO_CHECKOUT_PREVIEW_INTEGRATION.md`.


### Rutas neutrales de retorno de checkout — Preview (2026-06-26)

- Se agregaron las rutas públicas `/billing/return`, `/billing/success` y `/billing/cancel`.
- No requieren sesión y están fuera de `AuthGuard`.
- Ninguna ruta confirma pagos, activa planes, llama webhooks o modifica la base de datos.
- Se eliminaron de estas pantallas los textos y manejos específicos de Paddle.
- Las páginas funcionan en ES, EN y FR mediante el parámetro `lang`.
- Se configuró en Dodo Test Mode el redirect neutral hacia `https://preview.tugeocercas.com/billing/return?lang=es`.
- Validación OK: PRO y Enterprise retornan a `/billing/return?lang=es` al completar/salir del flujo TEST.
- Próxima fase: diseñar webhooks TEST con verificación server-side e idempotencia; no hacer SQL sin auditar primero la estructura de billing.
- No promover a Production hasta orden explícita.

### Diseño de webhooks Dodo TEST — bloqueado por acceso Supabase (2026-06-26)

- Se crearon documentos de arquitectura para la fase futura de webhooks TEST:
  - `DODO_WEBHOOKS_TEST_ARCHITECTURE.md`
  - `WEBHOOKS.md`
  - `BILLING_WEBHOOKS.md`
  - `SUBSCRIPTIONS_ARCHITECTURE.md`
- El diseño mantiene la separación proveedor externo / fuente interna de verdad.
- Dodo enviará eventos externos; la base interna de GeoField GPS deberá decidir plan, límites y entitlements.
- No se implementó SQL, Edge Functions, webhooks, API keys ni service role.
- No se toca Android ni Production.
- La implementación queda bloqueada hasta recuperar acceso al proyecto Supabase real `mujwsfhkocsuuahlrssn` y ejecutar auditoría read-only.
- No crear un proyecto Supabase nuevo ni cambiar `VITE_SUPABASE_URL` en Vercel.
