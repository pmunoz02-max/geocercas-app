# Paddle Migration (Preview)

## Scope
This update migrates billing in preview from Stripe to Paddle.

## Changes
- Replaced stripe-create-checkout with paddle-create-checkout
- Implemented paddle-webhook for subscription lifecycle events
- Disabled Stripe portal in preview
- Updated frontend upgrade flow to use Paddle checkout

## Affected Components
- UpgradeToProButton
- ManageSubscriptionButton
- Billing pages
- Supabase Edge Functions (paddle-create-checkout, paddle-webhook)

## Notes
- Changes apply only to preview environment
- Production (Stripe) remains untouched
- Webhook signature validation implemented using Paddle endpoint secret

## Next Steps
- Add idempotency for webhook events
- Implement Paddle subscription management portal