# Tracker Invite – Debug 500 (Preview)

## Context
A persistent error was observed when calling the tracker invite acceptance endpoint:

    accept_tracker_invite_failed:500

The error continued even after removing or simplifying the endpoint's business logic.

## Action Taken
To isolate the problem, the `/api/accept-tracker-invite` endpoint was replaced with a minimal handler:

```js
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    debug: 'HANDLER_REACHED_MINIMAL'
  })
}
```

## Purpose
This change is intended to verify that Vercel routing and runtime are functioning correctly, independent of any business logic. The goal is to confirm that the 500 error is not caused by application code, but potentially by deployment, configuration, or platform issues.
