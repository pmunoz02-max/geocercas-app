# Legal and commercial positioning for payment provider review

Last updated: 2026-06-15

## Purpose

This update strengthens the public legal and commercial positioning of Geocercas GPS before additional payment provider reviews.

The goal is to clearly present the product as an authorized business operations SaaS platform, not as a consumer surveillance or covert tracking product.

## Public positioning

Preferred description:

> Geocercas GPS is a business SaaS platform for authorized workforce operations, geofence-based attendance, field activity verification, and operational reporting.

Avoid positioning the product only as:

> GPS tracking of people

## Added public route

New public page:

- `/authorized-location-use`

Redirect aliases:

- `/location-privacy`
- `/gps-tracking-policy`

The page explains:

- authorized business use
- customer responsibility for worker notice and consent
- location data categories
- no covert tracking
- no spying, stalking, harassment, or non-business tracking
- Android app operational only
- subscriptions and payments are web-only

## Updated public legal routes

- `/privacy`
- `/terms`
- `/refund-policy`

Added redirect aliases:

- `/privacy-policy` -> `/privacy`
- `/terms-of-service` -> `/terms`
- `/refund` -> `/refund-policy`

## Payment provider messaging

When contacting payment providers, use wording such as:

- authorized workforce operations platform
- geofence-based attendance
- field activity verification
- operational reporting
- invited and authorized trackers only
- web-only subscription payments
- Android app operational only, no in-app purchases

Avoid wording that can be interpreted as covert or personal surveillance.

## Operational rule

This change does not modify billing logic, provider configuration, checkout, webhooks, API keys, subscriptions, database schema, or Android payment behavior.


## V3 routing hardening

Public legal routes now use dedicated English-only legal components under `src/pages/legal/`:

- `/privacy` and `/privacy-policy` use `LegalPrivacyPage.jsx`
- `/terms` and `/terms-of-service` use `LegalTermsPage.jsx`
- `/refund-policy` and `/refund` use `LegalRefundPage.jsx`

This avoids relying on legacy Spanish legal page files and makes the payment-provider review routes deterministic.


## Dodo Payments approval (2026-06-25)

Dodo Payments approved the merchant/account verification for FENICE ECUADOR S.A.S. and enabled live payments and payouts.

This approval was obtained using the legal/commercial framing in this document:

- authorized workforce operations
- geofence-based attendance
- field activity verification
- operational reporting
- invited/authorized trackers
- web-only subscription payments
- Android operational only, no in-app purchases

Operational note: approval does not authorize uncontrolled production rollout. Checkout, webhooks, API keys and production billing changes must still be implemented only through the preview workflow and documented before promotion.
