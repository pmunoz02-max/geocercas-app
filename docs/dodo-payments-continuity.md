# Continuidad — Dodo Payments aprobado

Fecha: 2026-06-25

## Estado

Dodo Payments aprobó la cuenta de FENICE ECUADOR S.A.S.

Confirmado por Ashna / Dodo Payments:

- Account Verification Forms successfully approved.
- Live payments enabled.
- Payouts enabled.
- UBO ID aceptado.
- Tax document / RUC aceptado.
- Incorporation document aceptado.

Dashboard mostró: `LIVE PAYMENTS ACTIVE`.

## Productos TEST creados

| Producto | Product ID TEST | Precio | Tipo |
|---|---|---:|---|
| Geocercas GPS PRO | `pdt_0NhoMPN43aLOXnHSZhrTk` | USD 29/month | Subscription |
| Geocercas GPS Enterprise | `pdt_0NhoND6E41RsKWVP43fW1` | USD 99/month | Subscription |

## Links TEST

```txt
https://test.checkout.dodopayments.com/buy/pdt_0NhoMPN43aLOXnHSZhrTk?quantity=1
https://test.checkout.dodopayments.com/buy/pdt_0NhoND6E41RsKWVP43fW1?quantity=1
```

## Validado visualmente

- Brand: Geocercas GPS.
- PRO: USD 29 / Month.
- Enterprise: USD 99 / Month.
- Checkout en Test Mode.
- Dodo aparece como online reseller / Merchant of Record.
- País Ecuador disponible.

## Reglas

- No tocar producción.
- No tocar Android.
- No pegar secretos en chat.
- No configurar webhooks live todavía.
- No activar checkout live dentro de la app todavía.
- Mantener arquitectura proveedor-agnóstica.
- Base de datos interna = fuente de verdad del plan.
- Dodo = proveedor externo de cobro / checkout / eventos / payouts.
- Trabajar solo en branch `preview`.
- Promote solo con orden expresa.

## Próximo paso probable

Revisar ZIP completo de la app y preparar integración TEST de Dodo en preview.
