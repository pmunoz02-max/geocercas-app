# Search Console canonical fix for language query URLs

Date: 2026-08-28
Branch: preview

## Context

Google Search Console reported a duplicate URL without a user-declared canonical:

- Affected URL: https://www.tugeocercas.com/?lang=es
- Preferred canonical URL: https://www.tugeocercas.com/

The public site uses `?lang=` query parameters for language switching. Search Console can treat these URLs as duplicate variants of the same page.

## Change

Added a React component:

- `src/components/CanonicalUrl.jsx`

The component updates or creates the `<link rel="canonical">` tag based on the current route pathname, ignoring query parameters such as `?lang=es`.

Examples:

- `/` and `/?lang=es` declare `https://www.tugeocercas.com/`
- `/privacy` declares `https://www.tugeocercas.com/privacy`
- `/refund-policy` declares `https://www.tugeocercas.com/refund-policy`

The component is mounted globally in:

- `src/App.jsx`

## Safety

This change does not modify Android, Google Play, Supabase, billing, tracker permissions, or production data.

It should be deployed first to Preview and then promoted only after validation.

## Validation checklist

On Preview, verify in browser console:

document.querySelector('link[rel="canonical"]')?.href

Expected results:

- `/?lang=es` -> `https://www.tugeocercas.com/`
- `/` -> `https://www.tugeocercas.com/`
- `/privacy` -> `https://www.tugeocercas.com/privacy`
- `/refund-policy` -> `https://www.tugeocercas.com/refund-policy`

After Production deployment, use Google Search Console to validate the fix for:

- https://www.tugeocercas.com/?lang=es
