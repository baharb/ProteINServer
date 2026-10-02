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

// ── Daily per-user caps (cost control). In memory: resets on restart/new day. ──
const usage = new Map();   // `${day}:${userId}:${kind}` -> count
function dailyCap(kind, max) {
  return (req, res, next) => {
    const day = new Date().toISOString().slice(0, 10);
    const key = `${day}:${req.userId}:${kind}`;
    const n = (usage.get(key) || 0) + 1;
    if (n > max) return res.status(429).json({ error: `Daily limit reached (${max}). It resets tomorrow.` });
    usage.set(key, n);
    if (usage.size > 50000) usage.clear();
    next();
  };
}

module.exports = { requireUser, dailyCap };
