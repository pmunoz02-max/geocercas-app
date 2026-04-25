# Skill: Onboarding (Activación de usuarios)

## Objetivo
Lograr que un usuario nuevo entienda el producto, vea valor y llegue a su primer resultado (tracking activo) en menos de 3 minutos.

---

## Regla crítica

```txt
Si el usuario no ve valor en 3 minutos → se pierde
Flujo ideal
Signup → Crear organización → Invitar tracker → Iniciar tracking → Ver mapa con datos
Definición de ACTIVACIÓN (CRÍTICO)

Un usuario está activado cuando:

Envía al menos 1 posición y la ve en el dashboard
Problema común

Usuarios se pierden en:

no saben qué hacer después de login
no entienden qué es un tracker
no saben cómo empezar tracking
no ven resultados
Solución: onboarding guiado
Paso 1: después del login

Mostrar pantalla clara:

Crea tu organización para comenzar
Paso 2: crear organización
simple
1 campo (nombre)
sin fricción
Paso 3: invitar tracker

Explicar:

Un tracker es la persona/dispositivo que enviará ubicación

CTA:

Invitar tracker
Paso 4: iniciar tracking

Mensaje claro:

Abre el enlace en el teléfono del tracker y presiona "Iniciar tracking"
Paso 5: mostrar resultado

Mostrar:

mapa con posición
mensaje:
Tracking activo
UI clave
pasos visibles (1,2,3…)
mensajes simples
sin términos técnicos
sin JSON
sin logs
Errores comunes

❌ Mostrar dashboard vacío sin explicación
❌ No guiar siguiente paso
❌ Demasiadas opciones
❌ Lenguaje técnico

Mensajes recomendados
"Empieza creando tu organización"
"Invita a alguien para empezar a rastrear"
"Inicia tracking en el dispositivo"
"Ya estás viendo datos en tiempo real"
UX crítica
siempre mostrar siguiente paso
no dejar usuario “pensando”
no dejar pantalla vacía
Métricas clave
% usuarios que crean organización
% que invitan tracker
% que inician tracking
% que llegan a ver posición
Experimentos

Probar:

textos de botones
número de pasos
orden de pasos
mostrar mapa antes o después
Backend

No bloquear onboarding por:

errores menores
analytics
procesos secundarios
Pruebas obligatorias
usuario nuevo entiende qué hacer
llega a tracking en menos de 3 minutos
no se queda en pantalla vacía
no necesita soporte
Bugfix tracking
## Bugfix YYYY-MM-DD - nombre

### Síntoma
...

### Causa raíz
...

### Solución permanente
...

### Impacto en activación
- ...
Regla Copilot
Archivo: Dashboard.jsx

Prompt:
Agrega guía de onboarding cuando no hay trackers sin cambiar lógica existente.
No hacer
no complicar onboarding
no mostrar todo de golpe
no usar lenguaje técnico
no dejar al usuario sin guía

---

## 🚀 Push corto

```bash
git add docs/skills/onboarding.md
git commit -m "docs: add onboarding skill [allow-docs]"
git push origin preview
🧠 Esto es importante

Con esto ya tienes:

producto funcional
monetización
growth
pricing
onboarding

👉 Esto ya es startup operativa real

🔥 Último nivel (si quieres cerrar el sistema)

👉 sales.md → vender a empresas (donde está el dinero grande)