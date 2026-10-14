// Public pages Google Play / the App Store require, plus account deletion.
//   GET    /privacy         privacy policy
//   GET    /delete-account  how to delete your account and data
//   GET    /terms           terms of use
//   GET    /help            help & support
//   DELETE /account         deletes the signed-in user's data and login (needs SUPABASE_SERVICE_ROLE_KEY)

const APP_NAME = 'ProteIN';
const CONTACT  = process.env.PRIVACY_CONTACT_EMAIL || '';
const UPDATED  = '2026-10-14';

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ${APP_NAME}</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0B0F14;color:#E6E9EE;font:16px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  main{max-width:760px;margin:0 auto;padding:32px 20px 64px}
  h1{color:#4ADE80;font-size:28px;margin:0 0 4px} h2{font-size:19px;margin:28px 0 8px}
  p,li{color:#C9CFD8} .muted{color:#9AA4B2;font-size:14px} a{color:#4ADE80}
  ul{padding-left:20px}
</style></head><body><main>${body}</main></body></html>`;

const contactLine = () => CONTACT
  ? `<a href="mailto:${CONTACT}">${CONTACT}</a>`
  : 'the contact email shown on our Google Play / App Store listing';

function privacyHtml() {
  return page('Privacy Policy', `
<h1>${APP_NAME} Privacy Policy</h1>
<p class="muted">Last updated: ${UPDATED}</p>

<p>${APP_NAME} helps you reach a daily protein goal. This policy explains what data the app uses, why, and your choices.
We do not sell your data and we do not show ads.</p>

<h2>Data we collect</h2>
<ul>
  <li><b>Account:</b> your email address and a password (handled by our login provider, Supabase; we never see your password).</li>
  <li><b>Profile:</b> optional name and photo, and the details you enter to calculate your protein target — age, gender, height, weight, activity level and goal.</li>
  <li><b>Meals:</b> the meals you log (name, protein, calories, time of day), so you can see your progress and streak.</li>
  <li><b>Meal photos:</b> when you scan a meal, the photo is sent to our server to identify the food. It is processed and then discarded — we do not store meal photos.</li>
  <li><b>Voice:</b> when you use the microphone, the recording is sent to our server to turn it into text, then deleted. We do not keep recordings.</li>
  <li><b>Text you type</b> to describe a meal or ask the coach, used only to answer you.</li>
</ul>
<p>Guests (not signed in) can browse the app; nothing is sent to our server for guests.</p>

<h2>How we use it</h2>
<ul>
  <li>To calculate your protein target, show your progress, streak and meal suggestions.</li>
  <li>To identify food in photos and text, and to answer coach questions, using an AI service.</li>
  <li>To limit daily use per account so the service stays available and free.</li>
</ul>

<h2>Who processes your data</h2>
<ul>
  <li><b>Supabase</b> — stores your account, profile and logged meals.</li>
  <li><b>Groq</b> — AI processing of meal photos, meal descriptions, voice and coach messages. Content is sent only to produce your answer.</li>
  <li><b>Render</b> — hosts our server.</li>
</ul>
<p>All data is sent over encrypted connections (HTTPS).</p>

<h2>Health information</h2>
<p>${APP_NAME} gives general nutrition information, not medical advice. Talk to a qualified professional before making health decisions.</p>

<h2>Keeping and deleting your data</h2>
<p>We keep your data while your account exists. You can delete your account and all its data at any time:
in the app go to <b>Profile → Account → Delete account</b>, or see <a href="/delete-account">how to delete your account</a>.
Deletion is permanent.</p>

<h2>Children</h2>
<p>${APP_NAME} is not intended for children under 13 and we do not knowingly collect their data.</p>

<h2>Contact</h2>
<p>Questions or requests: ${contactLine()}.</p>
<p class="muted">We may update this policy; the date at the top shows the latest version.</p>`);
}

function deleteHtml() {
  return page('Delete your account', `
<h1>Delete your ${APP_NAME} account</h1>
<p class="muted">Last updated: ${UPDATED}</p>
<h2>In the app (fastest)</h2>
<ol>
  <li>Open ${APP_NAME} and sign in.</li>
  <li>Tap your profile picture (top right) to open <b>Profile</b>.</li>
  <li>Under <b>Account</b>, tap <b>Delete account</b> and confirm.</li>
</ol>
<h2>Without the app</h2>
<p>Email ${contactLine()} from the address you signed up with and ask us to delete your account. We'll do it within 30 days.</p>
<h2>What gets deleted</h2>
<p>Your login, profile (name, photo, age, height, weight, goals), logged meals and weight history — permanently.
Meal photos and voice recordings are never stored, so there is nothing else to delete.</p>`);
}

function termsHtml() {
  return page('Terms of Use', `
<h1>${APP_NAME} Terms of Use</h1>
<p class="muted">Last updated: ${UPDATED}</p>
<p>By using ${APP_NAME} you agree to these terms. If you don't agree, please don't use the app.</p>
<h2>What the app does</h2>
<p>${APP_NAME} helps you track protein and suggests simple meals. Protein and calorie numbers — including those from photos,
voice and typed descriptions — are <b>estimates</b> and can be wrong. Check them when accuracy matters.</p>
<h2>Not medical advice</h2>
<p>${APP_NAME} gives general nutrition information only. It is not a substitute for a doctor or dietitian. If you are pregnant,
have a medical condition (for example kidney disease or diabetes) or take medication, talk to a professional before changing your diet.</p>
<h2>Your account</h2>
<ul>
  <li>Keep your login details private; you are responsible for activity on your account.</li>
  <li>You must be at least 13 years old to create an account.</li>
  <li>You can delete your account at any time from Profile → Account → Delete account.</li>
</ul>
<h2>Fair use</h2>
<p>The free version has daily limits on scans, voice and coach messages so it can stay free. Don't misuse the service,
try to break it, or use it to process content that isn't food-related.</p>
<h2>Changes and availability</h2>
<p>We may change or stop features, and update these terms; the date above shows the latest version.
The app is provided "as is", without warranties, to the extent the law allows.</p>
<h2>Contact</h2>
<p>${contactLine()}. See also our <a href="/privacy">Privacy Policy</a>.</p>`);
}

function helpHtml() {
  return page('Help', `
<h1>${APP_NAME} Help</h1>
<h2>Log a meal</h2>
<ul>
  <li><b>Type or say it:</b> on Today, write what you ate in any language (e.g. "2 eggs and toast") or tap 🎤 and speak, tap 🎤 again to stop.</li>
  <li><b>Scan it:</b> tap the green Scan button, then <b>Take photo</b>. To leave the camera without a photo, press your phone's Back button.</li>
  <li><b>Your foods:</b> foods you log are saved — tap one to log it again and choose how much.</li>
</ul>
<h2>Numbers look wrong?</h2>
<p>Estimates can be off. Remove a meal with ✕ in Today's log and add it again with the amount (e.g. "2 chicken breasts").</p>
<h2>"You've used today's free limit"</h2>
<p>The free version has a daily limit for scans, voice and the coach. It resets the next day; typing a meal and Your foods still work.</p>
<h2>Change language or target</h2>
<p>Open Profile (your picture, top corner) → Language, or Edit profile to update your weight and goal — your protein target updates automatically.</p>
<h2>Delete your account</h2>
<p>Profile → Account → Delete account. <a href="/delete-account">More info</a>.</p>
<h2>Still need help?</h2>
<p>Contact ${contactLine()}.</p>`);
}

// Delete rows through Supabase's REST API with the service role key, then the login itself.
async function deleteUser(userId) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('not_configured');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  for (const [table, col] of [['meals', 'user_id'], ['weight_log', 'user_id'], ['profiles', 'id']]) {
    const r = await fetch(`${url}/rest/v1/${table}?${col}=eq.${encodeURIComponent(userId)}`, { method: 'DELETE', headers });
    if (!r.ok && r.status !== 404) throw new Error(`delete ${table} failed (${r.status})`);
  }
  await fetch(`${url}/storage/v1/object/avatars/${encodeURIComponent(userId)}/avatar.jpg`, { method: 'DELETE', headers }).catch(() => {});
  const r = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE', headers });
  if (!r.ok) throw new Error(`delete login failed (${r.status})`);
}

function mountLegal(app, requireUser) {
  app.get('/privacy', (_req, res) => res.type('html').send(privacyHtml()));
  app.get('/delete-account', (_req, res) => res.type('html').send(deleteHtml()));
  app.get('/terms', (_req, res) => res.type('html').send(termsHtml()));
  app.get('/help', (_req, res) => res.type('html').send(helpHtml()));
  app.delete('/account', requireUser, async (req, res) => {
    try {
      await deleteUser(req.userId);
      res.json({ ok: true });
    } catch (e) {
      console.error('Account deletion failed:', e.message);
      res.status(e.message === 'not_configured' ? 503 : 500).json({ error: 'Could not delete the account right now.' });
    }
  });
}

module.exports = { mountLegal };
