# DODO PRO to Enterprise Change Plan Strategy

Fecha: 28 junio 2026
Branch: preview
Alcance: decisión de arquitectura de suscripción

## 1. Decisión

Para el paso de **PRO activo** a **Enterprise** se adoptará la estrategia:

```text
Change Plan directo
```

en lugar de abrir un nuevo checkout Enterprise.

## 2. Motivo

El flujo de checkout Enterprise visible fue validado correctamente en Preview, pero puede generar riesgo operativo de doble suscripción si el usuario ya tiene PRO activo.

La estrategia recomendada para Producción es modificar la suscripción existente mediante el mecanismo de cambio de plan de Dodo, manteniendo una sola suscripción activa por organización.

## 3. Regla funcional esperada

```text
FREE / inactive       -> checkout PRO o Enterprise
PRO active            -> Change Plan a Enterprise
Enterprise active     -> sin nueva compra
```

## 4. Flujo esperado PRO a Enterprise

```text
Usuario con PRO active
-> solicita upgrade a Enterprise
-> sistema identifica dodo_subscription_id actual
-> sistema solicita preview del cambio si está disponible
-> sistema ejecuta Change Plan en Dodo
-> Dodo emite webhook
-> webhook actualiza org_billing a Enterprise active
-> UI muestra Enterprise active
```

## 5. Reglas de seguridad

No se debe crear una segunda suscripción Enterprise si ya existe una suscripción PRO activa.

No se debe cambiar Production hasta validación completa en Preview.

No se deben pegar secrets en el chat.

No se debe tocar Supabase Production.

No se debe hacer Promote salvo orden expresa.

No se debe hacer push a main.

No se debe mezclar Preview con Producción.

## 6. Impacto técnico previsto

Archivos posibles:

```text
supabase/functions/dodo-create-checkout/index.ts
src/components/Billing/UpgradeToProButton.tsx
src/pages/Billing.jsx
src/config/billingCheckout.ts
docs/*
```

La implementación exacta se hará en pasos separados y validados en Preview.

## 7. Estado actual antes de implementar

La integración Dodo TEST en Preview quedó validada de punta a punta:

```text
Botón app Preview
-> dodo-create-checkout con sesión real y org_id actual
-> checkout Dodo TEST
-> pago exitoso
-> webhook firmado dodo-webhook
-> dodo_webhook_events
-> org_billing actualizado
-> Billing/Pricing reconocen plan activo
```

Producción no fue tocada.

No se hizo Promote.

## 8. Estado actual del flujo PRO a Enterprise

En el último estado validado de Preview:

```text
FREE / inactive      -> puede comprar PRO o Enterprise
PRO active           -> puede abrir checkout Enterprise
PRO active           -> no puede volver a comprar PRO
Enterprise active    -> bloquea nuevas compras
```

Este flujo permitió validar pago Enterprise TEST, pero antes de Producción se decidió avanzar hacia **Change Plan directo** para evitar doble suscripción.

## 9. Requisito antes de tocar código

Antes de implementar se debe revisar el archivo actual:

```text
supabase/functions/dodo-create-checkout/index.ts
```

y confirmar cómo está construido hoy el flujo:

```text
PRO active -> Enterprise
```

No se debe modificar a ciegas.

## 10. Implementación prevista en Preview

La implementación deberá lograr:

```text
Usuario PRO active
-> clic Subir a Enterprise
-> Edge Function valida org_id y plan actual
-> verifica dodo_subscription_id existente
-> llama a Dodo Change Plan o flujo equivalente de cambio de plan
-> no crea checkout Enterprise nuevo
-> espera webhook firmado
-> webhook actualiza org_billing
-> UI muestra Enterprise active
```

## 11. Validaciones requeridas

Después de implementar en Preview se debe validar:

```text
PRO activo no abre checkout Enterprise nuevo.
PRO activo usa cambio de plan sobre la suscripción existente.
Enterprise activo no muestra botón de nueva compra.
Billing reconoce Enterprise active.
Pricing reconoce Enterprise active.
Webhook registra evento correctamente.
org_billing queda coherente.
No se genera segunda suscripción activa.
```

## 12. Pendiente

Confirmar contra Dodo TEST la forma exacta del endpoint o flujo de Change Plan.

Implementar primero en Preview.

Validar con una organización de prueba.

Documentar resultado final.

Preparar checklist separado para Producción solo cuando Preview esté completamente validado.
