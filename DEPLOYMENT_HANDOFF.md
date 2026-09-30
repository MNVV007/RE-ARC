# RE:ARC Deployment Handoff

## Goal
Deploy the existing RE:ARC Winter Arc tracker without replacing its UI.

## Existing stack
- HTML/CSS/vanilla JavaScript frontend
- Node.js + Express backend
- Mongoose
- MongoDB Atlas

## Preserve
- RE:ARC branding and tagline
- Winter Arc 2026 visual direction
- Today-only editing rule
- Confirmation flow
- Streak logic
- Arc Day section
- Arc Mates/invite-link UI
- Responsive/mobile layout

## Integration work
1. Configure MongoDB Atlas using `MONGODB_URI` as a deployment secret.
2. Add real authentication and secure sessions before public release.
3. Replace the prototype client-ID trust model with authenticated user IDs.
4. Validate every API payload server-side.
5. Restrict CORS to the deployed frontend origin.
6. Add rate limiting to user/invite/progress endpoints.
7. Configure the frontend API base URL for the deployed backend.
8. Test two separate users/devices sharing an invite link and seeing refreshed streaks.
9. Test database reconnect/error states.
10. Deploy and run `/api/health` as a smoke test.

## Do not
- Do not commit `.env`.
- Do not expose `MONGODB_URI` to the browser.
- Do not rewrite the app into React/Next/etc. unless explicitly requested.
- Do not redesign the UI wholesale.
