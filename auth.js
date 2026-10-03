// Only signed-in users of the app may use the AI endpoints (they cost money).
// The app sends its Supabase session token; we ask Supabase who it belongs to.

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️  SUPABASE_URL / SUPABASE_ANON_KEY not set — every AI request will be rejected.');
}

// token -> { userId, expires } so we don't call Supabase on every request.
const tokenCache = new Map();
const CACHE_MS = 5 * 60 * 1000;

async function userFromToken(token) {
  const hit = tokenCache.get(token);
  if (hit && hit.expires > Date.now()) return hit.userId;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;
  const user = await res.json();
  if (!user?.id) return null;

  tokenCache.set(token, { userId: user.id, expires: Date.now() + CACHE_MS });
  if (tokenCache.size > 5000) tokenCache.delete(tokenCache.keys().next().value);
  return user.id;
}

async function requireUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(401).json({ error: 'Please sign in to use this feature.' });
  }
  try {
    const userId = await userFromToken(token);
    if (!userId) return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
    req.userId = userId;
    next();
  } catch (e) {
    console.error('Auth check failed:', e.message);
    res.status(503).json({ error: 'Could not verify your account. Try again.' });
  }
}

// ── Daily limits ────────────────────────────────────────────────────────────
// Free version: small per-user caps, plus a whole-server daily budget so the
// app stays inside Groq's free tier no matter how many people sign up.
// A paid plan later only needs higher numbers here (and planFor() to return it).
const PLAN_LIMITS = {
  free:    { scan: 8,  estimate: 25,  chat: 15,  voice: 20 },
  premium: { scan: 60, estimate: 250, chat: 150, voice: 200 },
};
const SERVER_DAILY_BUDGET = Number(process.env.SERVER_DAILY_BUDGET || 900);   // AI calls/day, all users

function planFor(_userId) {
  return 'free';   // TODO when payments exist: look up the user's subscription
}

const usage = new Map();   // `${day}:${who}:${kind}` -> count
const today = () => new Date().toISOString().slice(0, 10);
function bump(key) {
  const n = (usage.get(key) || 0) + 1;
  usage.set(key, n);
  if (usage.size > 50000) usage.clear();
  return n;
}

function dailyCap(kind) {
  return (req, res, next) => {
    const day = today();
    const limit = PLAN_LIMITS[planFor(req.userId)][kind];
    const used = usage.get(`${day}:${req.userId}:${kind}`) || 0;
    if (used >= limit) {
      return res.status(429).json({ code: 'daily_limit', error: `Daily limit reached (${limit}). It resets tomorrow.`, limit });
    }
    if ((usage.get(`${day}:server`) || 0) >= SERVER_DAILY_BUDGET) {
      return res.status(503).json({ code: 'busy', error: 'The app is very busy today. Please try again tomorrow.' });
    }
    bump(`${day}:${req.userId}:${kind}`);
    bump(`${day}:server`);
    res.setHeader('X-Remaining-Today', String(limit - used - 1));
    next();
  };
}

module.exports = { requireUser, dailyCap };
