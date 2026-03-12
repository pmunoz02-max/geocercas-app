# Deployment

**Infraestructura principal:**
- Vercel

## Ambientes

### Preview
- para desarrollo

### Producción
- https://app.tugeocercas.com

## Flujo de deploy

```
commit
  ↓
push branch preview
  ↓
Vercel crea deployment preview
  ↓
test
  ↓
Promote to Production
```