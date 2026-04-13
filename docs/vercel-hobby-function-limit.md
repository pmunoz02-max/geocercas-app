# Vercel Hobby function limit

Temporary debug endpoint `api/accept-invite-v2.js` was removed because Hobby only allows up to 12 serverless functions per deployment.

Rule:
- do not create temporary API endpoints in preview
- reuse existing API files for debugging
- keep api/ limited to active entrypoints only
The shared helper extractRequestedOrgId was moved from api/_lib to server/api-lib because files inside api/_lib also count toward the Vercel Hobby function limit.