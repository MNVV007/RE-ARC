require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname));

const PORT = Number(process.env.PORT) || 3000;
const MONGO_URI = process.env.MONGODB_URI;
const COOKIE_NAME = "rearc_session";
const SESSION_DAYS = 30;

const UserSchema = new mongoose.Schema({
  reArcId: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  name: { type: String, required: true, maxlength: 30, trim: true },
  passwordHash: { type: String, required: true },
  goals: { type: Array, default: [] },
  checks: { type: mongoose.Schema.Types.Mixed, default: {} },
  visits: { type: mongoose.Schema.Types.Mixed, default: {} },
  bestStreak: { type: Number, default: 0 },
  arcStartDate: { type: String, default: "" },
}, { timestamps: true });

const SessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const FriendshipSchema = new mongoose.Schema({
  userA: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  userB: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
FriendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });

const User = mongoose.model("User", UserSchema);
const Session = mongoose.model("Session", SessionSchema);
const Friendship = mongoose.model("Friendship", FriendshipSchema);

function dbReady() { return mongoose.connection.readyState === 1; }
function normalizeEmail(v) { return String(v || "").trim().toLowerCase(); }
function makeReArcId() { return "RA" + crypto.randomBytes(4).toString("base64url").replace(/[-_]/g, "").slice(0, 6).toUpperCase(); }
async function uniqueReArcId() { let id; do { id = makeReArcId(); } while (await User.exists({ reArcId: id })); return id; }
function hashToken(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}
function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const derived = crypto.scryptSync(password, parts[1], 64);
  const expected = Buffer.from(parts[2], "hex");
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`);
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  await Session.create({ tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000) });
  setSessionCookie(res, token);
}
async function auth(req, res, next) {
  if (!dbReady()) return res.status(503).json({ error: "Database is not connected." });
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Authentication required." });
  const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) return res.status(401).json({ error: "Session expired. Please log in again." });
  const user = await User.findById(session.userId);
  if (!user) return res.status(401).json({ error: "Account not found." });
  req.user = user;
  req.session = session;
  next();
}
function currentStreak(u) {
  const pad = n => String(n).padStart(2, "0");
  const key = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const completed = k => (Array.isArray(u.goals) ? u.goals : []).filter(g => u.checks?.[`${g.id}_${k}`]).length;
  const qualifies = k => !!u.visits?.[k] || completed(k) >= 2;
  let streak = 0, d = new Date();
  while (qualifies(key(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}
function publicUser(u) {
  const streak = currentStreak(u);
  return { id: u._id.toString(), reArcId: u.reArcId, name: u.name, streak, bestStreak: Math.max(u.bestStreak || 0, streak) };
}
function publicMe(u) {
  return { ...publicUser(u), email: u.email, goals: u.goals, checks: u.checks, visits: u.visits, arcStartDate: u.arcStartDate };
}
function pairIds(a, b) {
  const x = a.toString(), y = b.toString();
  return x < y ? [a, b] : [b, a];
}

app.get("/api/health", (req, res) => res.json({ ok: true, database: dbReady() }));

app.post("/api/auth/signup", async (req, res) => {
  try {
    if (!dbReady()) return res.status(503).json({ error: "Database is not connected." });
    const name = String(req.body?.name || "").trim().slice(0, 30);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (name.length < 2) return res.status(400).json({ error: "Please enter a name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
    if (await User.exists({ email })) return res.status(409).json({ error: "An account with that email already exists." });

    const user = await User.create({
      reArcId: await uniqueReArcId(),
      email,
      name,
      passwordHash: hashPassword(password),
      arcStartDate: new Date().toISOString().slice(0, 10)
    });

    await createSession(user._id, res);
    res.status(201).json(publicMe(user));
  } catch (e) {
    // Keep the user-facing message safe, but expose the real database error in
    // the server logs so it is visible in Render logs and can be diagnosed.
    console.error("[RE:ARC] Signup failed:", {
      name: e?.name,
      code: e?.code,
      codeName: e?.codeName,
      message: e?.message,
      keyPattern: e?.keyPattern,
      keyValue: e?.keyValue
    });

    // MongoDB duplicate-key errors can happen even after the pre-check
    // (for example if two signups race). Return a useful message.
    if (e?.code === 11000) {
      const duplicateField = Object.keys(e.keyPattern || {})[0];
      if (duplicateField === "email") {
        return res.status(409).json({ error: "An account with that email already exists." });
      }
      if (duplicateField === "reArcId") {
        return res.status(409).json({ error: "RE:ARC ID collision. Please try creating the account again." });
      }
      return res.status(409).json({ error: "That account data already exists. Please try again." });
    }

    res.status(500).json({
      error: "Could not create account.",
      debug: process.env.NODE_ENV !== "production" ? String(e?.message || e) : undefined
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    if (!dbReady()) return res.status(503).json({ error: "Database is not connected." });
    const email = normalizeEmail(req.body?.email), password = String(req.body?.password || "");
    const user = await User.findOne({ email });
    if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: "Email or password is incorrect." });
    await createSession(user._id, res);
    res.json(publicMe(user));
  } catch (e) { res.status(500).json({ error: "Could not log in." }); }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const token = parseCookies(req)[COOKIE_NAME];
    if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
    clearSessionCookie(res); res.json({ ok: true });
  } catch { clearSessionCookie(res); res.json({ ok: true }); }
});

app.get("/api/auth/me", auth, async (req, res) => res.json(publicMe(req.user)));

app.put("/api/me/progress", auth, async (req, res) => {
  try {
    const { name, goals, checks, visits, bestStreak, arcStartDate } = req.body || {};
    if (name !== undefined) req.user.name = String(name).trim().slice(0, 30) || req.user.name;
    if (Array.isArray(goals)) req.user.goals = goals;
    if (checks && typeof checks === "object") req.user.checks = checks;
    if (visits && typeof visits === "object") req.user.visits = visits;
    if (Number.isFinite(bestStreak)) req.user.bestStreak = bestStreak;
    if (typeof arcStartDate === "string") req.user.arcStartDate = arcStartDate.slice(0, 10);
    await req.user.save(); res.json(publicMe(req.user));
  } catch { res.status(500).json({ error: "Could not save progress." }); }
});

app.delete("/api/me/progress", auth, async (req, res) => {
  try {
    req.user.goals = [];
    req.user.checks = {};
    req.user.visits = {};
    req.user.bestStreak = 0;
    req.user.arcStartDate = new Date().toISOString().slice(0, 10);
    await req.user.save();
    res.json(publicMe(req.user));
  } catch { res.status(500).json({ error: "Could not reset tracker data." }); }
});

app.get("/api/friends", auth, async (req, res) => {
  const rows = await Friendship.find({ $or: [{ userA: req.user._id }, { userB: req.user._id }] });
  const ids = rows.map(r => r.userA.equals(req.user._id) ? r.userB : r.userA);
  const users = await User.find({ _id: { $in: ids } });
  res.json(users.map(publicUser));
});

app.post("/api/friends", auth, async (req, res) => {
  try {
    const reArcId = String(req.body?.reArcId || "").trim().toUpperCase();
    if (!reArcId) return res.status(400).json({ error: "Enter a RE:ARC ID." });
    if (reArcId === req.user.reArcId) return res.status(400).json({ error: "You cannot add yourself." });
    const target = await User.findOne({ reArcId });
    if (!target) return res.status(404).json({ error: "That RE:ARC ID does not exist." });
    const [userA, userB] = pairIds(req.user._id, target._id);
    await Friendship.updateOne({ userA, userB }, { $setOnInsert: { userA, userB } }, { upsert: true });
    res.json(publicUser(target));
  } catch (e) { res.status(500).json({ error: "Could not add Arc Mate." }); }
});

app.delete("/api/friends/:id", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Arc Mate not found." });
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: "Arc Mate not found." });
    const [userA, userB] = pairIds(req.user._id, target._id);
    await Friendship.deleteOne({ userA, userB });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not remove Arc Mate." }); }
});

app.get("/api/invites/:reArcId", async (req, res) => {
  try {
    const u = await User.findOne({ reArcId: String(req.params.reArcId).toUpperCase() });
    if (!u) return res.status(404).json({ error: "Invite not found." });
    res.json(publicUser(u));
  } catch { res.status(404).json({ error: "Invite not found." }); }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

mongoose.connection.on("error", err => {
  console.error("[RE:ARC] MongoDB error:", err);
});
mongoose.connection.on("disconnected", () => {
  console.warn("[RE:ARC] MongoDB disconnected.");
});
mongoose.connection.on("reconnected", () => {
  console.log("[RE:ARC] MongoDB reconnected.");
});

async function start() {
  if (!MONGO_URI) console.warn("MONGODB_URI is missing. Authentication is unavailable until MongoDB is configured.");
  else {
    try { await mongoose.connect(MONGO_URI); console.log("MongoDB connected"); }
    catch (e) { console.error("MongoDB connection failed:", e.message); }
  }
  app.listen(PORT, () => console.log(`RE:ARC running on port ${PORT}`));
}
start();
