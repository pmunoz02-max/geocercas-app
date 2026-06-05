---

## Estado actual (2026-05-01)

- Asignaciones operativas: la lógica de asignación y sincronización está activa y funcional.
- `tracker_assignments` es un espejo runtime de las asignaciones activas, actualizado automáticamente por el backend.
- `tracker_positions` es la fuente de datos para el dashboard y reportes de posiciones.
- El endpoint `invite-tracker` bloquea la invitación si `personal.user_id` es null (no permite invitar sin usuario enlazado).

### Actualización Preview — Tracker pairing codes (2026-06-04)

- Nuevo flujo Preview documentado en [docs/tracker-onboarding.md](docs/tracker-onboarding.md).
- Arquitectura validada: Magic Link como identidad mínima, pairing code para emparejar organización/persona/tracker, y runtime token opaco para GPS.
- Tabla DB: `tracker_pairing_codes`.
- RPCs validadas en Supabase Preview con prueba transaccional y `ROLLBACK`:
  - `rpc_create_tracker_pairing_code`
  - `rpc_claim_tracker_pairing_code`
- Estado: DB/RPCs validadas en Preview.
- Pendiente: API admin, API tracker, UI admin, UI tracker y validación Android end-to-end en Preview.
- No promover a Production hasta orden explícita.

### Nuevos alias de rutas para geocercas (web)

- `/geofences` ahora redirige a `/geocercas`.
- `/new-geofence` y `/nueva-geocerca` ahora redirigen a `/geocerca`.
- Estos cambios aplican solo a la web. No hubo cambios en la base de datos, API ni Android.

### Nuevos alias de rutas de detalle de geocerca (web)

- `/geocercas/:id` y `/geofences/:id` ahora abren la vista VerGeocerca.
- Esto es solo para la web. No afecta la base de datos, API, Android ni producción.

### Actualización de página de geocercas (web)

- Las rutas `/geocercas` y `/geofences` ahora usan la página moderna de mapa Geocercas.jsx.
- GeocercasList.jsx es legacy y no está activa.
- Este cambio es solo para la web; no afecta base de datos, API, Android ni producción.

arquitectura vigente
servicio válido: ForegroundLocationService
entry point: WebViewActivity
deep link válido: /tracker-accept
carpeta _deprecated no usar para implementar

---

## Nota de cierre

El flujo completo de invitación de tracker, onboarding Android GeoField GPS y envío de posiciones quedó validado en producción (`app.tugeocercas.com`) usando Google Play Internal Testing.

## Nota (mayo 2026)

- El listado de geocercas ahora recibe el campo `area_m2`, calculado en el backend/PostGIS mediante la función `list_geofences_with_area_preview`.
- En la interfaz de NuevaGeocerca, se muestra el área de cada geocerca y se permite elegir la unidad de área (m², ha, km² o acres), persistiendo la preferencia del usuario en `localStorage`.
- El área canónica de cada geocerca se calcula exclusivamente en el backend; el frontend solo realiza la conversión y formato para visualización, pero no calcula el área.
- La función `list_geofences_with_area_preview` ahora también devuelve `centroid_lat` y `centroid_lng`, calculados en PostGIS con `ST_PointOnSurface(geom)`. El componente NuevaGeocerca utiliza este punto interno representativo para mostrar Lat/Lng, garantizando que siempre esté dentro del polígono, lo cual es útil incluso para geocercas con linderos irregulares.

### Ajuste Preview — límite Vercel Hobby y pairing API (2026-06-04)

- Para respetar el límite de Serverless Functions del plan Vercel Hobby, no se usa un endpoint nuevo `/api/tracker-pairing-code`.
- La creación admin de pairing code queda integrada en `api/invite-tracker.js` mediante `action: "create_pairing_code"`.
- Se elimina `api/tracker-pairing-code.js`.
- Se elimina `api/health.js` para dejar margen bajo el límite de funciones.
- Estado actual: solo create pairing code en API Preview.
- Reclamar pairing code, UI admin, UI tracker y validación Android end-to-end siguen pendientes.
- No promover a Production hasta orden explícita.

### Ajuste Preview — claim pairing code API (2026-06-05)

- Se integra la acción tracker `claim_pairing_code` dentro de `api/accept-tracker-invite.js`.
- No se crea un endpoint nuevo para evitar superar el límite de Serverless Functions de Vercel Hobby.
- La acción espera un tracker autenticado por Magic Link y un `pairing_code`.
- La validación llama a `rpc_claim_tracker_pairing_code`.
- Si el código es válido, devuelve runtime token opaco para continuar el flujo GPS.
- Estado: API implementada en Preview; pendiente validar endpoint en Deploy Preview y luego crear UI tracker.
- No promover a Production hasta orden explícita.

### Ajuste Preview — UI admin pairing code (2026-06-05)

- Se agregó en `src/pages/InvitarTracker.jsx` una sección admin para generar y copiar códigos de emparejamiento.
- La UI llama a `POST /api/invite-tracker` con `action: "create_pairing_code"`.
- El flujo anterior de invitación por email no se reemplaza ni se elimina.
- Estado: UI admin implementada en Preview; pendiente validar visualmente en Deploy Preview.
- Pendiente siguiente: UI tracker para ingresar código después de Magic Link.
- No promover a Production hasta orden explícita.

### Ajuste Preview — UI tracker pairing code (2026-06-05)

- Se agregó en `src/pages/TrackerInviteStart.jsx` una sección para que el tracker ingrese un código de emparejamiento después de iniciar sesión con Magic Link.
- La UI llama a `POST /api/accept-tracker-invite` con `action: "claim_pairing_code"`.
- Si el código es válido, se reutiliza el flujo existente que persiste `tracker_runtime_token`, `tracker_user_id` y `org_id`.
- Después del claim exitoso, el tracker es redirigido a `/tracker-gps`.
- No se creó endpoint nuevo.
- Estado: UI tracker implementada en Preview; pendiente validar en Deploy Preview y Android end-to-end.
- No promover a Production hasta orden explícita.
