# Registro técnico — Seguridad de logs del onboarding Tracker

- ID de tarea: GEO-2026-11-20-logs-onboarding
- Fecha de apertura: 2026-11-20
- Última actualización: 2026-11-20
- Tipo: Cambio y verificación de seguridad
- Situación de la tarea: En curso (pruebas integrales pendientes)
- Referencia de versión: [merge a4851224a0d42526c33165c590b408fe2f995833](https://github.com/pmunoz02-max/geocercas-app/commit/a4851224a0d42526c33165c590b408fe2f995833); [PR #3](https://github.com/pmunoz02-max/geocercas-app/pull/3)

## Objetivo y alcance

Evitar que los diagnósticos de consola del onboarding tracker revelen tokens de invitación, tokens operativos, respuestas completas o URL de redirección con credenciales, sin alterar el funcionamiento del flujo.

## Trabajo realizado y resultado

- En `preview`, el PR #3 reemplazó el token de invitación impreso por `hasInviteToken`, omitió `data` del diagnóstico de campos faltantes, sustituyó la URL de redirección por un destino fijo y un indicador, y dejó de imprimir objetos de error potencialmente sensibles.
- Según la verificación informada por Codex en el chat el 20-11-2026, se ejecutaron **en Node aislado, en memoria**, las expresiones de las 14 llamadas de consola con tokens ficticios presentes y ausentes: 8 `log`, 1 `warn` y 5 `error` por escenario.
- En esas capturas simuladas no aparecieron los tokens o URL sensibles ficticios.
- Codex comparó las dos revisiones reemplazando las llamadas a consola por marcadores y reportó que el código restante era idéntico. Esto acredita equivalencia estática del código fuera de los logs, **no un flujo funcional completo**.
- Los resultados de pruebas aisladas son evidencia reportada por Codex; este registro no implica ejecución independiente de las pruebas por un segundo verificador.

## Archivos técnicos y documentación afectados

| Ruta | Acción realizada o propuesta |
|---|---|
| `src/pages/TrackerInviteStart.jsx` | Modificado en PR #3; solo argumentos de consola |
| `docs/changes/2026-11-20-logs-onboarding-preview.md` | Registro documental nuevo preparado para PR de revisión |

## Estado por entorno

| Entorno | Implementación: estado y evidencia | Pruebas: estado y evidencia | Publicación: estado y evidencia |
|---|---|---|---|
| Local | No confirmada — copia local no verificada | Superadas — solo expresiones de consola en Node aislado, según informe de Codex | No aplica — pruebas ejecutadas en memoria |
| Preview | Completada en rama — [commit a485122](https://github.com/pmunoz02-max/geocercas-app/commit/a4851224a0d42526c33165c590b408fe2f995833) | Parciales — pruebas aisladas, sin montaje React, navegador ni Android | No confirmada funcionalmente — GitHub registró despliegue de la rama del PR; no se verificó ejecución del onboarding desplegado |
| Producción | No confirmada — fuera de alcance | No ejecutadas — fuera de alcance | No realizada por esta tarea |

## Validaciones y comprobaciones

| Comprobación | Entorno / revisión | Resultado y evidencia |
|---|---|---|
| 14 expresiones de consola, tokens ficticios presentes | Node aislado / revisión tras PR #3 | Superada según informe de Codex: ningún token o URL sensible en argumentos capturados |
| 14 expresiones de consola, tokens vacíos | Node aislado / revisión tras PR #3 | Superada según informe de Codex |
| Comparación estática fuera de las llamadas a consola | Código GitHub / PR #3 | Superada según informe de Codex: resto del código sin cambios |
| Build, React en navegador, puente Android y flujo extremo a extremo | Preview / dispositivos | No ejecutadas; pendientes de entorno de prueba autorizado |
| Revisión de registros históricos u otras vías de exposición | Todos | No ejecutada; fuera del alcance |

## Impacto documental y operativo

- Este documento da trazabilidad a la prueba informada sin declarar probado el onboarding completo.
- `docs/README_CURRENT.md` solo debe reflejar el estado de seguridad con evidencia y sin atribuir pruebas de Preview a Producción.
- Permanecen identificadores operativos en diagnósticos; su minimización puede evaluarse por separado.
- El transporte de token por URL permanece sin cambios y requiere revisión específica si se pretende modificar.

## Pendientes y continuidad

1. Ejecutar una prueba funcional del onboarding en Preview con cuentas y tokens ficticios, incluyendo respuesta incompleta, código de emparejamiento, redirección y fallos simulados.
2. Comprobar en el navegador y en Android autorizado que no aparecen secretos en mensajes de consola.
3. Registrar resultados y versión exacta en este mismo ID; no cerrar la tarea como validada integralmente antes de ello.
4. Evaluar aparte si existieron logs históricos con credenciales y qué mitigación procede, sin compartir secretos.

## Referencias

- [PR #3](https://github.com/pmunoz02-max/geocercas-app/pull/3)
- [Componente del onboarding en preview](https://github.com/pmunoz02-max/geocercas-app/blob/preview/src/pages/TrackerInviteStart.jsx)
- [Protocolo técnico](https://github.com/pmunoz02-max/geocercas-app/blob/preview/docs/CHANGE_IMPLEMENTATION_PROTOCOL.md)
- [Plantilla documental](https://github.com/pmunoz02-max/geocercas-app/blob/preview/docs/templates/TECHNICAL_CHANGE_RECORD.md)
