# Registro técnico — <título>

- ID de tarea: GEO-AAAA-MM-DD-tema-breve
- Fecha de apertura: AAAA-MM-DD
- Última actualización: AAAA-MM-DD
- Tipo: Cambio | Diagnóstico | Decisión
- Situación de la tarea: Abierta | En curso | Bloqueada | Cerrada
- Referencia de versión: <SHA, release, versión verificable o No disponible>

## Objetivo y alcance

<Problema, resultado esperado y límites autorizados.>

## Trabajo realizado y resultado

<Distinguir hechos, hallazgos, decisiones, propuestas y actividades no realizadas.>

## Archivos técnicos y documentación afectados

| Ruta | Acción realizada o propuesta |
|---|---|
| <ruta relativa> | <descripción: realizada o propuesta> |

<Indicar Sin modificaciones cuando corresponda.>

## Estado por entorno

Cada celda debe incluir un estado permitido y evidencia, o motivo de no confirmación.

| Entorno | Implementación: estado y evidencia | Pruebas: estado y evidencia | Publicación: estado y evidencia |
|---|---|---|---|
| Local | <estado — evidencia o motivo> | <estado — evidencia o motivo> | <estado — evidencia o motivo> |
| Preview | <estado — evidencia o motivo> | <estado — evidencia o motivo> | <estado — evidencia o motivo> |
| Producción | <estado — evidencia o motivo> | <estado — evidencia o motivo> | <estado — evidencia o motivo> |

Estados:
- Implementación: No iniciada, Parcial, Completada, No confirmada, No aplica.
- Pruebas: No ejecutadas, Parciales, Superadas, Fallidas, No confirmadas, No aplica.
- Publicación: No realizada, Realizada, No confirmada, No aplica.

No transferir evidencias entre entornos. Un commit no prueba publicación; publicar no implica pruebas superadas.

## Validaciones y comprobaciones

| Comprobación | Entorno / revisión | Resultado y evidencia |
|---|---|---|
| <comprobación> | <entorno / SHA o No aplica> | <resultado o No ejecutada y motivo> |

## Impacto documental y operativo

<Enlaces a documentos canónicos relacionados, consecuencias y restricciones; indicar si debe actualizarse docs/README_CURRENT.md.>

## Pendientes y continuidad

<Siguiente paso, bloqueos y reversión si corresponde. Una continuación conserva el mismo ID y registro.>

## Referencias

- <Documentación o evidencia relacionada, sin duplicar contenido.>
