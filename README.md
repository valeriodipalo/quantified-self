# Quantified Self

> Personal time-tracking PWA — log activities to Google Calendar with one tap.

A phone-first web app for quantified-self tracking. Tap once to start an activity, tap again to stop — the recorded session lands directly on your Google Calendar. View aggregated stats from a Mac-friendly dashboard.

**Calendar = database.** Events are stored as Google Calendar entries on dedicated per-activity calendars, so no separate database is required at MVP scale and your data stays portable.

## Status

Early development. Currently building the MVP for **reading-time tracking**.

## Planned features

- [ ] **MVP — Reading tracker**: start/stop button → Google Calendar event with duration
- [ ] **Cigarette counter**: instantaneous tally events
- [ ] **Generalized activity engine**: user-defined activity types (per-activity color, calendar, capture mode)
- [ ] **Mac dashboard**: charts, streaks, weekly/monthly summaries from calendar data
- [ ] **PWA polish**: installable to iPhone home screen, offline queue, app icon

## Tech stack

- [Next.js 15](https://nextjs.org) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com)
- [Google Calendar API v3](https://developers.google.com/workspace/calendar/api/v3/reference) (OAuth 2.0, server-side refresh tokens)
- Deployed on [Vercel](https://vercel.com)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Before the OAuth flow works locally you'll need a `.env.local` with Google OAuth credentials — setup instructions will land here once the auth wiring is in place.

## License

[MIT](./LICENSE)
