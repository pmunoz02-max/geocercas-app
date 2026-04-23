# Paddle Subscription Cancellation & Webhook State Machine

## 1. Core Rule
- `org_billing` is the **single source of truth** for access.

## 2. States
- **Active**: `plan_status = "active"`, `cancel_at_period_end = false`
- **Active + Scheduled Cancellation**: `plan_status = "active"`, `cancel_at_period_end = true`
- **Canceled**: `plan_status = "canceled"`, `cancel_at_period_end = true`

## 3. State Transitions

```
User/API        Paddle         Webhook         org_billing
   |              |               |                |
   |--cancel req->|               |                |
   |              |               |--update------->| cancel_at_period_end = true
   |              |--sub.updated->|--update------->| confirm scheduled_change
   |              |--sub.canceled>|--update------->| plan_status = canceled
```

- **API cancel request**: sets `cancel_at_period_end = true` (no access change)
- **Paddle subscription.updated**: confirms scheduled change
- **Paddle subscription.canceled**: final state, sets `plan_status = "canceled"`

## 4. Rules
- Access **allowed** only if `plan_status === "active"`
- **Do NOT** remove access when cancel is scheduled
- **Remove access** only when webhook confirms canceled

## 5. Idempotency
- Use `event_id` and `occurred_at` for all webhook events
- Ignore older or duplicate webhook events

## 6. Database Fields Involved
- `plan_status`
- `cancel_at_period_end`
- `scheduled_change_action`
- `scheduled_change_effective_at`
- `last_paddle_event_at`

## 7. UI Behavior
- **Show banner** when `cancel_at_period_end = true`
- **Show active plan** until `current_period_end`

## 8. Architecture Flow

```
user → cancel API → Paddle → webhook → org_billing → UI
```

## 9. State Machine Diagram

```mermaid
stateDiagram-v2
    [*] --> Active: Subscription created/active
    Active --> ScheduledCancellation: API cancel request
    ScheduledCancellation --> ScheduledCancellation: Paddle subscription.updated (confirm schedule)
    ScheduledCancellation --> Canceled: Paddle subscription.canceled (webhook)
    Active --> Canceled: Paddle subscription.canceled (webhook)
    Canceled --> [*]: Terminal state

    state Active {
      note right of Active: plan_status = "active"\ncancel_at_period_end = false
    }
    state ScheduledCancellation as "Active + Scheduled Cancellation" {
      note right of ScheduledCancellation: plan_status = "active"\ncancel_at_period_end = true
    }
    state Canceled {
      note right of Canceled: plan_status = "canceled"\ncancel_at_period_end = true
    }
```

---

**Summary:**
- All access decisions are based on `org_billing`.
- Cancellation is scheduled (not immediate) and only enforced after webhook confirmation.
- UI and backend remain in sync via webhook-driven state.
