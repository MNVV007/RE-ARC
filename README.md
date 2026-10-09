# RE:ARC — Reset. Refocus. Rebuild.

A lightweight, mobile-first Winter Arc goal tracker with real account authentication and two-way Arc Mates powered by MongoDB Atlas.

## Stack

**Frontend:** HTML + CSS + vanilla JavaScript  
**Backend:** Node.js + Express  
**Database:** MongoDB Atlas + Mongoose  
**Authentication:** Express + MongoDB sessions (no Firebase/Supabase/Auth0/Clerk)

## Product features

- RE:ARC branding: **Reset. Refocus. Rebuild.**
- Winter Arc 2026 identity
- Today-focused progress hero
- Arc Day counter
- Custom goals
- Only today's cells can be changed
- Past and future dates are locked
- Confirmation before changing today's progress
- Current and best streaks
- Active flame glow / broken streak smoke
- Arc Mates with two-way friendship relationships
- Invite by shareable RE:ARC ID link
- Add Arc Mate manually by RE:ARC ID
- Remove Arc Mate with an in-app confirmation popup
- Account signup/login/logout
- Persistent HTTP-only session cookie
- Unique public RE:ARC ID for every account
- Server-side authorization for personal progress
- MongoDB-backed progress and friendship storage
- Mobile-friendly responsive UI
- Letter-style footer signature: **with love, M.N.V.V**

## Local development

1. Install Node.js LTS.
2. In this folder run:

```bash
npm install
```

3. Copy `.env.example` to `.env`.
4. Add your MongoDB Atlas connection string and session configuration:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
PORT=3000
NODE_ENV=development
```

5. Start the app:

```bash
npm start
```

6. Open `http://localhost:3000`.

## Authentication

Authentication is handled by the existing Express server. There is no separate authentication provider.

- Passwords are hashed with Node's built-in `crypto.scryptSync`.
- Login creates a random server-side session token.
- Only the SHA-256 hash of the token is stored in MongoDB.
- The browser receives the token through an HTTP-only cookie.
- Sessions expire after 30 days and are automatically removed by MongoDB's TTL index.
- Protected routes derive the current user from the session instead of trusting a user ID supplied by the browser.

## Arc Mates

Every account receives a short unique public RE:ARC ID such as `RA7K4P2`.

A user can:

- Share an invite link containing that RE:ARC ID.
- Tell a friend their ID and let the friend add it manually.
- Remove an Arc Mate later.

Friendships are stored in MongoDB as canonical user pairs, so adding someone creates a relationship visible to **both users**. Removing it removes the relationship for both users.

Only public Arc information is returned to Arc Mates. Email addresses, password hashes, and private progress data are not exposed through friend endpoints.

## Deployment

For a simple Render deployment, run the Node/Express app as one web service so the frontend and API share the same origin.

Set these environment variables in the deployment dashboard:

```env
MONGODB_URI=your-real-atlas-connection-string
NODE_ENV=production
```

Do not commit `.env` or place `MONGODB_URI` in frontend JavaScript.

Make sure the MongoDB Atlas network settings allow the deployed server to connect.

## Smoke tests after deployment

1. Create Account A.
2. Create Account B in a separate browser/device.
3. Copy Account A's RE:ARC ID.
4. Add A from B using the ID.
5. Confirm B sees A under Arc Mates.
6. Log back into A and confirm A sees B.
7. Share A's invite link and confirm it works after login.
8. Remove the Arc Mate and confirm it disappears for both accounts.
9. Refresh while logged in and confirm the session persists.
10. Log out and confirm protected data is no longer accessible.
11. Check `/api/health` and confirm `database: true`.
