# Tracker Invite Landing

## Purpose
Public landing for tracker invitations on Android.

## Flow
- `/tracker-accept` now renders a public landing page
- it tries to open the Android app by deep link
- if the app is not installed, it shows an install button
- user can also continue in browser to `/tracker-gps`

## Changes
- Added `src/pages/TrackerInviteStart.jsx`
- Updated route in `src/App.jsx`
- Removed Vercel rewrite that bypassed landing in `vercel.json`

## Goal
Support tracker onboarding both with and without the Android app already installed.