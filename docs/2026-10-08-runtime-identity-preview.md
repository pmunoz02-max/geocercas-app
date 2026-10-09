# Preview runtime identity correction — 2026-10-08

## Evidence
Pietro has 600 tracker_positions rows in SIM GPS/GNSS Preview, last received 2026-10-08 10:34:59 UTC. Browser reads personal correctly and constructs one offline marker. Connected Preview v15 service stores Test Limite Org while holding renewal state from the previous enrollment. No Production access or writes were performed.

## Root mechanism and correction
TrackerGpsPage previously merged URL and storage field by field. Native URL capture and bridge writers could overwrite org/token before renewal identity checks. A known credential must not be reassigned to a different org/user.

Web now chooses a complete session from a single source and rejects conflicting storage organization aliases. Android accepts only complete handoffs, binds renewal state to org/user, preserves renewed credentials for their enrolled original token, clears renewal state for a genuinely new complete session, and commits token/user/org together before legacy writes. Partial invitation navigation preserves the existing runtime session.

No table or RLS changes. Android source is the isolated geocercas-twa-preview tree; the native patch is archived under docs/android-patches/runtime-identity. Web changes are only on branch preview. Existing sessions already corrupted require authorized reactivation; no credential is relabelled or fabricated.

## Validation
Web regression tests cover partial URL org, partial URL token, complete cross-org handoff, generic auth identity rejection, and conflicting org aliases. Web: 5/5 regression tests passed; Vite build passed. Android: build passed; 8/8 identity assertions passed on physical Preview device with isolated preferences. Verified hashes established current access belonged to Test Limite Org while retained renewed access/proof belonged to SIM GPS/GNSS Preview. Existing Preview renewal endpoint accepted the retained proof and returned the SIM identity; native storage was restored atomically. Final APK excludes the temporary instrumentation harness. Fresh GPS persistence still requires verification. Counter mismatch and false positive service-start UI are separate pending defects.
