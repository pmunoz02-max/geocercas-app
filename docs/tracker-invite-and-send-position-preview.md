# Tracker preview updates

Branch: preview only  
Environment: preview only  
Do not apply directly to production.

## Summary
This update includes three changes for tracker flows in preview:

1. Invite URL parsing
- Improved tracker invite URL parsing to accept valid preview invite shapes more robustly.
- Error `invalid_tracker_invite_url_shape` should now appear only when required parameters are truly missing.

2. Real tracker position writes
- `api/send-position.js` now validates the Bearer tracker token.
- Position writes are intended to persist real tracker updates to `positions` and `tracker_latest`.
- This flow is for invited tracker identity, not owner session fallback.

3. Friendly tracker names in dashboard
- Tracker Dashboard now prefers friendly labels instead of raw UUIDs.
- Priority order is display name, name, personal/profile full name, email, and only then user_id.

## Notes
- Preview only.
- No main changes.
- No production mixing.
- After architecture changes, docs must be updated before commit.