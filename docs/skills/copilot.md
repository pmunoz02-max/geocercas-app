## Regla: No duplicar documentación

Antes de crear un nuevo archivo .md:

1. Buscar si ya existe un documento relacionado en /docs/skills
2. Si existe → ACTUALIZARLO
3. NO crear archivos duplicados para el mismo flujo o feature

Objetivo:
- Mantener una única fuente de verdad
- Evitar inconsistencias
- Reducir errores en arquitectura

Aplicación obligatoria en:
- Flujos críticos (auth, tracker, billing, tracking)
- Cambios de backend
- Cambios de rutas o contratos frontend

Regla práctica:
"Si ya hay un .md parecido → se edita, no se crea otro"
Estrategia Universal de Uso (Costo + Eficiencia)
🎯 Objetivo

Usar GitHub Copilot con el menor consumo posible de AI Credits, manteniendo velocidad de desarrollo en Geocercas.

⚠️ PRINCIPIO CLAVE

Copilot = ejecución puntual
ChatGPT = pensamiento + arquitectura

🧠 REGLA #1 — NO USAR COPILOT PARA PENSAR

❌ NO usar Copilot para:

arquitectura
debugging complejo
decisiones de backend
entender errores grandes
explicar código

👉 Eso gasta MUCHOS créditos

✅ USAR ChatGPT (yo) para eso

⚙️ REGLA #2 — COPILOT SOLO PARA EJECUCIÓN

Copilot se usa SOLO para:

✔ escribir funciones
✔ completar código
✔ refactors pequeños
✔ reemplazos exactos
✔ wiring (conexiones simples)

✍️ REGLA #3 — PROMPTS CORTOS (CRÍTICO)
❌ MAL (caro)
// explain and refactor entire file and improve architecture
✅ BIEN (barato)
// add validation for null user_id

👉 Regla:

1 instrucción = 1 cambio

🧩 REGLA #4 — FLUJO OBLIGATORIO CONTIGO (ChatGPT)

Siempre trabajar así:

PASO 1

Me preguntas aquí

👉 Yo te doy:

solución óptima
lógica correcta
estructura
PASO 2

Yo te digo:

Archivo a abrir
Prompt corto para Copilot
PASO 3

Ejecutas en VS Code con Copilot

PASO 4

Push inmediato a preview (Vercel)

💰 REGLA #5 — EVITAR MODO “AGENTE”

Copilot ahora hace esto:

analiza repo completo
ejecuta múltiples pasos

👉 ESO = consumo alto

❌ EVITAR:
“fix entire project”
“analyze repo”
“optimize everything”
✅ USAR:
cambios quirúrgicos
🧱 REGLA #6 — TRABAJAR POR ARCHIVO

Siempre:

1 archivo → 1 cambio → push

Esto:

reduce errores
reduce consumo
facilita debug
🔁 REGLA #7 — NUNCA ITERAR CON COPILOT

❌ NO hacer:

prueba/error con Copilot
pedirle varias versiones

👉 eso quema créditos

✅ hacer:

pensar primero aquí
ejecutar 1 vez en Copilot
🧪 REGLA #8 — DEBUGGING INTELIGENTE

Cuando haya bug:

❌ NO:

“Copilot fix bug”

✅ SÍ:

traer error aquí
analizar
luego Copilot aplica fix puntual
📊 REGLA #9 — FEATURES GRANDES

Para cosas grandes (ej: billing, tracking, auth):

Flujo:
Diseñamos aquí (completo)
Dividimos en pasos
Copilot ejecuta por partes
🚀 REGLA #10 — OPTIMIZACIÓN DE COSTO

Si haces esto bien:

👉 Reduces consumo hasta 70–90%