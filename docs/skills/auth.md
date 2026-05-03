# Skill: Auth & Roles

## Objetivo
Garantizar autenticación, manejo de sesión y control de acceso por organización sin inconsistencias entre preview y producción.

Este skill es CRÍTICO. Si falla, toda la app queda expuesta o inutilizable.

---

## Reglas operativas

- Auth SIEMPRE se valida en frontend + backend.
- Nunca confiar solo en estado visual.
- Nunca asumir rol global del usuario.
- El acceso SIEMPRE depende de:

```txt
user_id + org_id
Flujo correcto de autenticación
Usuario ingresa por /auth
Supabase gestiona login (PKCE)
Se obtiene sesión válida (access_token + refresh_token)
Se guarda en storage (localStorage)
AuthContext inicializa estado global
Se resuelve organización activa
Se resuelve rol dentro de esa organización
Se permite acceso a rutas protegidas
Fuente de verdad
Usuario
auth.users.id
Perfil extendido
personal.owner_id
personal.user_id

Regla obligatoria:

personal.user_id debe existir y estar sincronizado con owner_id
Resolución de organización activa

El usuario puede pertenecer a múltiples organizaciones.

La app debe:

Determinar org activa (por selección o default)
Validar membresía en esa org
Obtener rol dentro de esa org

Nunca usar rol global.

Roles

Ejemplo esperado:

owner
admin
tracker
viewer

Regla crítica:

El rol SIEMPRE depende de (user_id, org_id)

Caso especial:

Si un usuario es admin en una org y tracker en otra:
Debe comportarse como tracker en la org donde fue invitado como tracker.
Guards de rutas (frontend)

Archivo típico:

AuthGuard / ProtectedRoute

Debe:

Bloquear acceso si no hay sesión válida
Bloquear acceso si no hay org activa
Bloquear acceso si rol no permitido
Reglas de rutas
Ruta	Requiere login	Notas
/auth	NO	Página pública
/dashboard	SÍ	Protegida
/tracker	SÍ	Solo tracker
/reports	SÍ	Admin/owner
Problemas conocidos (deben evitarse)
1. Acceso sin login

Síntoma:

/dashboard abre sin autenticación

Causa:

AuthGuard no validando sesión correctamente

Solución:

Validar session !== null antes de renderizar
2. Redirect incorrecto en producción

Síntoma:

/auth redirige a landing

Causa:

Configuración incorrecta en Supabase

Regla:

En producción:

Site URL:
https://app.tugeocercas.com

Redirect URLs SOLO:

https://app.tugeocercas.com/auth/callback
https://app.tugeocercas.com/reset-password

NO incluir preview en producción.

3. Sesión inconsistente entre preview y producción

Causa:

uso de diferentes dominios + storage

Regla:

Nunca compartir sesión entre preview y producción
Validar ENV_KIND en logs
Tokens

Se usan:

access_token
refresh_token

Reglas:

Nunca exponer en UI
Nunca loguear en consola en producción
Android puede almacenarlos en TokenStore seguro
Backend (Supabase / Edge Functions)

Toda función debe:

Validar token
Resolver user_id
Validar org_id
Validar rol si aplica

Nunca confiar en datos enviados desde frontend sin validar.

SQL obligatorio antes de cambios

Antes de modificar lógica:

select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'personal',
    'organization_members',
    'organizations'
  );
Reglas de logout
Limpiar sesión completa
Limpiar org activa
Redirigir a /auth
Reglas de UI
No mostrar datos técnicos
No mostrar tokens
No mostrar errores internos
Mostrar mensajes claros al usuario
Android / WebView
Debe mantener sesión correctamente
Manejar refresh token
No quedar en pantalla blanca
Si falla auth → mostrar retry/login
Bugfix tracking

Formato obligatorio:

## Bugfix YYYY-MM-DD - nombre

### Síntoma
...

### Causa raíz
...

### Solución permanente
...

### Archivos modificados
- ...

### Prueba
- ...
Pruebas obligatorias
Preview
Login funciona
Logout funciona
No acceso sin login
Org activa se resuelve
Rol correcto por org
Rutas protegidas funcionan
Producción

Solo validar si hubo Promote explícito.

Push / deploy
git add docs/skills/auth.md
git commit -m "docs: add auth skill [allow-docs]"
git push origin preview
Regla Copilot
Abrir archivo exacto
Prompt corto
No mezclar cambios

Ejemplo:

Archivo: AuthContext.jsx

Prompt:
Valida sesión null antes de renderizar children.
No hacer
No asumir rol global
No permitir acceso sin sesión
No mezclar preview con producción
No confiar en frontend para validar permisos
No loguear tokens
No hardcodear org_id

---

Push corto:

```bash
git add docs/skills/auth.md
git commit -m "docs: add auth skill [allow-docs]"
git push origin preview
```

## Onboarding para usuarios nuevos sin organización

- Los usuarios recién creados que aún no tienen organización **deben ver un onboarding claro** (pantalla /inicio o mensaje de espera), nunca una pantalla blanca ni un error genérico.
- Debe indicarse explícitamente que falta aceptar invitación de tracker o que el administrador debe asignar una organización/rol.
- El flujo correcto es: login exitoso → mensaje de bienvenida/espera → usuario espera invitación o asignación de rol.
- Nunca dejar al usuario sin feedback visual o con la app bloqueada sin explicación.