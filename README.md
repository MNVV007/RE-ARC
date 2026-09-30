# RE:ARC — Reset. Refocus. Rebuild.

A lightweight, mobile-first Winter Arc goal tracker. The frontend is local-first and includes today's-only check-ins, confirmation before changing progress, streaks, Arc Mates, and an Express/Mongoose/MongoDB Atlas integration scaffold.

## Product features

- RE:ARC branding: **Reset. Refocus. Rebuild.**
- Winter Arc 2026 challenge identity
- Today-focused hero with daily completion progress
- Arc Day counter
- Custom goals
- Only today's cells can be changed
- Past and future dates are locked
- Month + date + weekday in the tracker header
- Confirmation before completing/removing today's progress
- Streaks and best streak
- Arc Mates invite links and public streak cards
- Local-first storage with MongoDB sync when the backend is configured
- Mobile-friendly responsive UI

## Local development

1. Install Node.js LTS.
2. In this folder run:

```bash
npm install
```

3. Copy `.env.example` to `.env`.
4. Add your MongoDB Atlas connection string:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
PORT=3000
```

5. Start the app:

```bash
npm start
```

6. Open `http://localhost:3000`.

## Deployment / AI-agent handoff

The project is intentionally prepared as a simple full-stack handoff:

**Frontend → Express API → Mongoose → MongoDB Atlas**

An external deployment/coding agent can use this project as the starting point. Ask it to preserve the existing UI and only modify what is needed for authentication, production security, database configuration, and deployment.

### API base URL

The frontend uses:

```js
window.WINTER_ARC_API || "http://localhost:3000/api"
```

If frontend and backend are deployed separately, configure `window.WINTER_ARC_API` to the deployed API URL before loading `script.js`. If they are deployed together through Express, the default same-server API path can be used after changing the production configuration appropriately.

## MongoDB Atlas

Create a free Atlas M0 cluster, create a database user, configure Network Access for the deployment environment, and keep `MONGODB_URI` server-side as an environment secret. Never place the MongoDB connection string in frontend JavaScript.

## Important integration notes

The included friend system is a lightweight prototype scaffold, not production authentication. It currently uses a generated client ID and invite code. Before public deployment, the integration agent should add:

- real authentication/session handling
- server-side authorization
- stricter request validation
- rate limiting / abuse protection
- secure CORS configuration
- production error handling and logging
- HTTPS and deployment secrets

Do **not** put MongoDB credentials in the repository.
