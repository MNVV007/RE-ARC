# RE:ARC Deployment Handoff

## Current architecture

**Frontend → Express → Mongoose → MongoDB Atlas**

Authentication is implemented inside the existing Express backend. No separate auth provider is required.

## Environment variables

```env
MONGODB_URI=your-real-atlas-connection-string
NODE_ENV=production
PORT=10000
```

Render can provide `PORT`; do not hard-code a production port.

## What is implemented

- Account signup
- Account login
- Account logout
- Persistent HTTP-only session cookie
- 30-day server session with MongoDB TTL cleanup
- Password hashing using Node `crypto.scryptSync`
- Unique public RE:ARC ID
- Authenticated `/api/me/progress` storage
- Two-way MongoDB friendships
- Add Arc Mate by RE:ARC ID
- Invite link using RE:ARC ID
- Remove Arc Mate
- Server-side ownership checks for private progress
- Public-only friend data
- Resetting tracker data also resets the server-side progress

## MongoDB collections/models

- `users`
- `sessions`
- `friendships`

Friendship pairs are stored in canonical order with a unique compound index to prevent duplicate relationships.

## Deployment

Use a single Node/Express web service for the simplest setup. The same service serves `index.html`, `script.js`, `style.css`, and `/api/*`.

### Render

- Build command: `npm install`
- Start command: `npm start`
- Add `MONGODB_URI` as a secret environment variable.
- Set `NODE_ENV=production`.
- Do not commit `.env`.

### MongoDB Atlas

Create/configure the Atlas database and make sure the deployed server is permitted to connect. Keep the connection string only in the deployment environment.

## Required post-deployment tests

### Authentication

- Sign up as User A.
- Refresh the page.
- Confirm User A remains logged in.
- Log out.
- Confirm protected data is unavailable.
- Sign in again.

### Friendship

- Create User A and User B in separate browser sessions.
- Copy A's RE:ARC ID.
- Add A from B using the ID.
- Confirm B sees A.
- Sign in as A.
- Confirm A sees B.
- Remove the friendship.
- Confirm both sides no longer list each other.

### Invite link

- Copy A's invite link.
- Open it in B's browser.
- If B is logged out, B should be asked to log in/sign up first and the invite should then be consumed.
- Confirm the friendship is created for both users.

### Security

- A must not be able to edit B's progress by changing an ID in a request.
- Friend endpoints must expose only public Arc information.
- MongoDB credentials must never appear in frontend code.
