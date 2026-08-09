# Cambio de Node 20.x a 24.x en Vercel Preview

## Resumen
- Se actualizó la configuración de runtime en package.json para exigir Node 24.x.
- El cambio quedó registrado en package.json con:
  - "engines": { "node": "24.x" }
- La validación se realizó en Vercel Preview y el build terminó con éxito.

## Detalle del cambio
- Se reemplazó la restricción previa de Node 20.x por Node 24.x en package.json.
- No se modificaron scripts ni dependencias.

## Aclaración importante sobre Vercel
- En Project Settings de Vercel sigue apareciendo Node 20.x como valor mostrado.
- Eso no invalida el cambio realizado en package.json: el manifiesto ahora impone Node 24.x para la app.
- En caso de conflicto, la configuración declarada en package.json tiene prioridad para la resolución del runtime del proyecto.

## Estado
- Validado en Vercel Preview: build exitoso.
- Estado de runtime en el proyecto: package.json exige Node 24.x, aunque la UI de Project Settings aún refleje 20.x.
