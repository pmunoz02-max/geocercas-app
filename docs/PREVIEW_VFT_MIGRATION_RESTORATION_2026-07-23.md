# Preview VFT migration restoration — 2026-07-23

## Scope

This change applies only to the `preview` branch.

It does not execute SQL against Supabase Preview or Production and does not modify the remote database migration history.

## Restored file

- `supabase/migrations/20260208000400_preview_vft.sql`

The migration file stored in the repository was empty. It was restored from the migration content fetched directly from the linked Supabase Preview project.

## Verification

The restored local file was compared byte-for-byte with the copy fetched from Preview.

- File size: `471628` bytes
- SHA-256: `233034D8FE86B37B2C3F0CF8C37676254B8C8F1E89B18F350E98F467B4CB1B88`
- `git diff --check`: no errors
- Restored SQL lines reported by Git: `14311`

A historical complete version from commit `4326b24b` was also reviewed. Its binary representation differed because of whitespace and blank-line formatting, but Git found no functional SQL differences when those differences were ignored.

## Safety boundaries

This commit:

- Restores only the repository copy of the VFT migration.
- Does not run `supabase db push`.
- Does not run `supabase migration repair`.
- Does not run a local or remote database reset.
- Does not deploy any Edge Function or application build.
- Does not modify Production.
- Does not include the pending Paddle webhook changes.