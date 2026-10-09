# Speed y heading opcionales — Preview, 2026-10-09

`POST /api/send-position` acepta `speed` en m/s y `heading` en grados. Ambos campos son opcionales y admiten `null`; la ausencia se guarda explícitamente como SQL NULL en `public.tracker_positions`. Los clientes antiguos siguen siendo compatibles.

Solo se aceptan números JSON finitos. `speed` debe ser mayor o igual a cero, sin un máximo arbitrario. `heading` debe estar entre 0 inclusive y 360 exclusivo. Cero es válido y se conserva. Cadenas numéricas, cadenas vacías, booleanos, arrays, objetos, valores negativos y valores no finitos se rechazan. Un campo inválido devuelve HTTP 400 con `{ok:false,error:"invalid_speed"}` o `invalid_heading`, antes de consultar geocercas o insertar una posición. No se convierte ni normaliza silenciosamente un valor inválido.

La sesión runtime sigue determinando usuario y organización. Se mantienen la protección de identidad y el requisito de estar dentro de una geocerca asignada activa. No cambian accuracy, coordenadas, respuesta de éxito ni tablas/RLS. Las columnas speed y heading ya existen, son double precision, nullable y sin default.

El endpoint Vercel escribe directamente en tracker_positions. Esta mejora no modifica la Edge Function send_position ni crea sincronización con positions/tracker_latest. Android Preview actual aún no envía speed ni bearing; continuará almacenando NULL hasta que se implemente esa parte por separado. Heading representa rumbo de desplazamiento, no orientación del teléfono.

Pruebas del handler con transporte Supabase simulado: persistencia, cero, decimales, límites, valores inválidos, campos ausentes/null, cuerpo JSON serializado, autenticación y geocerca. No se enviaron posiciones de prueba a Supabase. Validación local: 36 pruebas aprobadas y build correcto. Publicación limitada a branch preview.
