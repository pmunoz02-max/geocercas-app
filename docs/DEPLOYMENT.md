# Deployment

**Infraestructura principal:**
- Vercel

## Ambientes


### Preview
- para desarrollo
- billing: Paddle (migrado)

### Producción
- https://app.tugeocercas.com
- billing: Stripe legacy (no migrado)

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