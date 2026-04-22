# Paddle Cancel Subscription

## Purpose
Handles subscription cancellation requests from the frontend and updates billing status.

## Flow
1. Receives org_id and subscription identifiers
2. Calls Paddle API to cancel subscription
3. Updates org_billing / org_entitlements
4. Sets plan_status accordingly

## Notes
- A canceled subscription may still remain active until period end
- plan_status normalization is required in frontend