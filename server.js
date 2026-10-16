require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const multer    = require('multer');
const Groq      = require('groq-sdk');
const { toFile } = Groq;
const FOOD_REF  = require('./foodReference');
const { requireUser, dailyCap } = require('./auth');
const { mountLegal } = require('./legal');

const app    = express();
const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 1, timeout: 30000 });
// Audio stays in memory; it's sent to Whisper with a real file name, because
// Groq picks the audio format from the extension (a bare temp file is rejected).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Per-minute limits are counted per signed-in user (requireUser runs first).
const byUser = { keyGenerator: (req) => req.userId || req.ip, standardHeaders:true, legacyHeaders:false };
const chatLimiter       = rateLimit({ ...byUser, windowMs:60000, max:30,  message:{ error:'Too many requests.' } });
const scanLimiter       = rateLimit({ ...byUser, windowMs:60000, max:15,  message:{ error:'Too many scan requests.' } });
const transcribeLimiter = rateLimit({ ...byUser, windowMs:60000, max:20,  message:{ error:'Too many voice requests.' } });

// App language code → name used in prompts ("reply in Persian").
const LANG_NAMES = { en:'English', fa:'Persian (Farsi)', ar:'Arabic', es:'Spanish', ja:'Japanese', zh:'Simplified Chinese' };
const langName = (code) => LANG_NAMES[code] || 'English';

// Groq says "rate limit" (free tier full) → tell the app it's busy, not broken.
const isGroqBusy = (err) => err?.status === 429 || /rate limit/i.test(err?.message || '');
const busy = (res) => res.status(503).json({ code: 'busy', error: 'The app is very busy right now. Please try again in a minute.' });

mountLegal(app, requireUser);

app.get('/', (_req, res) => res.json({ status:'ProteIN AI Server v2.0 ✅' }));

// ── AI Chat ────────────────────────────────────────────────────────────────
app.post('/chat', requireUser, chatLimiter, dailyCap('chat'), async (req, res) => {
  const { messages, profile, lang } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error:'messages required' });

  const goalLabel = (profile?.goals||[]).map(g=>({lose:'Lose Fat',muscle:'Build Muscle',healthy:'Stay Healthy'}[g])).filter(Boolean).join(' + ') || 'General Health';

  const system = `You are a concise protein-focused nutrition coach in the ProteIN app.
IMPORTANT: General wellness info only — always advise consulting a doctor for medical decisions.

USER: Goal:${goalLabel} | Protein target:${profile?.goalProtein||120}g | Today:${profile?.todayProtein||0}g of ${profile?.goalCalories||2000} kcal
${profile?.age ? `Stats: Age ${profile.age}, ${profile.weightKg?.toFixed?.(1)}kg` : ''}

RULES:
- Be action-oriented, not generic. Tell them EXACTLY what to eat.
- Max 3 short paragraphs or a bullet list.
- Always answer "what should I eat NOW?" with specific foods + grams.
- Size suggestions to close the remaining gap — do not overshoot it by more than ~10g.
- Prefer everyday household portions (1 skewer, 1 plate, 2 eggs, 1 cup) over grams.
- Always reply in ${langName(lang)}, whatever language the question is in.
- 1 emoji max per response.
- Never pad. Never say "great question."`;

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.CHAT_MODEL || 'openai/gpt-oss-20b',
      messages: [{ role:'system', content:system }, ...messages.slice(-8)],
      temperature: 0.6,
      max_tokens: 1200,
      reasoning_effort: 'low',
    });
    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) throw new Error('Empty response');
    res.json({ reply });
  } catch(err) {
    console.error('Chat error:', err.message);
    if (isGroqBusy(err)) return busy(res);
    res.status(500).json({ error: err.message });
  }
});

// ── Food Scan ──────────────────────────────────────────────────────────────
app.post('/scan', requireUser, scanLimiter, dailyCap('scan'), async (req, res) => {
  const { imageBase64, mimeType = 'image/jpeg', lang } = req.body;
  if (!imageBase64) return res.status(400).json({ error:'imageBase64 required' });

  const prompt = `You are a nutrition expert analyzing a food photo. Identify ALL visible ingredients.
Return ONLY valid JSON, no markdown, no extra text:
{
  "meal_name": "Name of the dish",
  "ingredients": [
    { "name": "Chicken Breast", "amount_g": 150, "per_100g": { "calories": 165, "protein": 31, "carbs": 0, "fat": 4 } }
  ],
  "confidence": "high|medium|low",
  "notes": "optional note"
}
Rules:
- List EVERY visible ingredient separately (proteins, grains, vegetables, sauces, oils)
- amount_g = your estimate for THIS specific portion shown
- per_100g = standard USDA values, integers only
- Write meal_name and every ingredient name in ${langName(lang)}.
- If no food detected: {"error": "Cannot identify food in image"}`;

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.SCAN_MODEL || 'qwen/qwen3.8-27b',
      messages: [{
        role: 'user',
        content: [
          { type:'text', text:prompt },
          { type:'image_url', image_url:{ url:`data:${mimeType};base64,${imageBase64}` } },
        ],
      }],
      temperature: 0.1,
      max_tokens: 900,
    });

    const rawText = completion.choices[0]?.message?.content?.trim();
    if (!rawText) throw new Error('Empty response from vision model');

    const jsonText = rawText.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const parsed   = JSON.parse(jsonText);

    if (parsed.error) return res.json({ error: parsed.error });
    if (!parsed.ingredients?.length) throw new Error('No ingredients detected');

    // Calculate totals
    const totals = parsed.ingredients.reduce((acc, ing) => {
      const f = (ing.amount_g || 0) / 100;
      return {
        calories: acc.calories + Math.round((ing.per_100g?.calories||0) * f),
        protein:  acc.protein  + Math.round((ing.per_100g?.protein ||0) * f),
        carbs:    acc.carbs    + Math.round((ing.per_100g?.carbs   ||0) * f),
        fat:      acc.fat      + Math.round((ing.per_100g?.fat     ||0) * f),
      };
    }, { calories:0, protein:0, carbs:0, fat:0 });

    res.json({
      meal_name:   parsed.meal_name || 'Scanned Meal',
      ingredients: parsed.ingredients.map(ing => ({
        name:     ing.name || 'Unknown',
        amount_g: Math.max(0, Math.round(ing.amount_g || 0)),
        per_100g: {
          calories: Math.max(0, Math.round(ing.per_100g?.calories||0)),
          protein:  Math.max(0, Math.round(ing.per_100g?.protein ||0)),
          carbs:    Math.max(0, Math.round(ing.per_100g?.carbs   ||0)),
          fat:      Math.max(0, Math.round(ing.per_100g?.fat     ||0)),
        },
      })),
      totals,
      confidence: parsed.confidence || 'medium',
      notes:      parsed.notes      || '',
    });

  } catch(err) {
    console.error('Scan error:', err.message);
    if (isGroqBusy(err)) return busy(res);
    if (err instanceof SyntaxError) return res.status(500).json({ error:'Could not parse food data. Try a clearer photo.' });
    res.status(500).json({ error: err.message });
  }
});

// ── Describe your meal ─────────────────────────────────────────────────────
// "کوبیده با برنج" / "2 eggs and toast" → items with household portions.
const estimateLimiter = rateLimit({ ...byUser, windowMs:60000, max:30, message:{ error:'Too many requests.' } });
// Only send the reference foods that appear in the user's text — sending all of
// them cost ~2,200 tokens per request and hit Groq's per-minute token limit.
const norm = (x) => x.toLowerCase().replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/\u200c/g, ' ');
const REF_INDEX = FOOD_REF.map(f => ({
  f,
  words: [...norm(f.name).split(/[\s/()]+/), ...norm(f.fa).split(/[\s/()]+/)].filter(w => w.length >= 3),
}));
function relevantRefs(text) {
  const q = norm(text);
  return REF_INDEX.filter(r => r.words.some(w => q.includes(w))).slice(0, 10).map(r => r.f);
}
const refLine = (f) => `${f.name} (${f.fa}) — per ${f.unit}: ${f.protein}g protein, ${f.calories} kcal`;

app.post('/estimate', requireUser, estimateLimiter, dailyCap('estimate'), async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 300);
  const lang = req.body?.lang;
  if (!text) return res.status(400).json({ error:'text required' });

  const refs = relevantRefs(text);
  const system = `You turn a short meal description (in any language, or mixed) into foods with protein estimates.
${refs.length ? `Use these reference values when a food matches (per ONE household unit):\n${refs.map(refLine).join('\n')}\n` : ''}
Return ONLY JSON: {"items":[{"name":"Kabab koobideh","emoji":"🍢","unit":"skewer","qty":2,"qty_given":false,"protein_per_unit":15,"calories_per_unit":230}]}
Rules:
- One item per distinct food. "koobideh with rice" = 2 items.
- name MUST be written in ${langName(lang)}. The Persian names in the reference only help recognise Persian input — never copy them unless the answer language is Persian. unit = one of these English words: skewer, plate, piece, bowl, egg, glass, palm, slice, serving, cup, can, scoop, sheet, handful, fillet, sandwich, burger — never grams.
- qty = the amount the user said; if not said, a normal single portion (usually 1; 2 skewers for koobideh; 2 eggs).
- qty_given = true if the user stated any amount, including "a", "an", "one", "some", "یه", "یک", "دو", numbers.
- For foods not in the reference, estimate realistically. Integers only.
- If the text is not food, return {"items":[]}.`;

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.ESTIMATE_MODEL || 'openai/gpt-oss-20b',
      messages: [{ role:'system', content:system }, { role:'user', content:`Meal: ${text}
Write every "name" in ${langName(lang)}.` }],
      temperature: 0.1,
      max_tokens: 2000,
      reasoning_effort: 'low',
      response_format: { type:'json_object' },
    });
    const raw = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw.replace(/```json\n?|```/g, '').trim());
    const items = (parsed.items || []).slice(0, 8).map(it => ({
      name:              String(it.name || 'Food').slice(0, 60),
      emoji:             String(it.emoji || '🍽️').slice(0, 4),
      unit:              String(it.unit || 'serving').slice(0, 20),
      qty:               Math.min(10, Math.max(0.5, Number(it.qty) || 1)),
      qty_given:         !!it.qty_given,
      protein_per_unit:  Math.max(0, Math.round(Number(it.protein_per_unit) || 0)),
      calories_per_unit: Math.max(0, Math.round(Number(it.calories_per_unit) || 0)),
    }));
    if (!items.length) return res.json({ error:"Couldn't find a food in that. Try e.g. \"2 eggs and toast\"." });
    res.json({ items });
  } catch (err) {
    console.error('Estimate error:', err.message);
    if (isGroqBusy(err)) return busy(res);
    res.status(500).json({ error:'Could not estimate that meal. Try again.' });
  }
});

// ── Voice Transcription (Groq Whisper — FREE) ──────────────────────────────
// A short neutral sentence per language: Whisper reads it as a hint, so short
// clips aren't mis-detected (Persian heard as Arabic/Urdu) — but the user can
// still speak another language; nothing is forced. Deliberately not about food,
// so an echo of it (what Whisper outputs for silence) is easy to tell apart.
const VOICE_HINTS = {
  en: 'Hello, this is my food diary.',
  fa: 'سلام، این دفترچه غذای من است.',
  ar: 'مرحبًا، هذه مذكرات طعامي.',
  es: 'Hola, este es mi diario de comidas.',
  ja: 'こんにちは、これは私の食事日記です。',
  zh: '你好，这是我的饮食日记。',
};

// With silence or noise Whisper "hears" its prompt (our hint) or a stock phrase.
// Treat those as nothing said, so a silent recording never logs a meal.
const words = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
const SILENCE_PHRASES = /^(thank you|thanks for watching|you|bye|okay|ok|مرسی|ممنون|زیرنویس|شكرا|ありがとうございました|谢谢)[.!。！\s]*$/i;
function isEcho(text, hint) {
  const said = words(text);
  if (!said.length || SILENCE_PHRASES.test(String(text).trim())) return true;
  const hintWords = new Set(words(hint));
  const squash = (t) => words(t).join('');
  if (squash(text) === squash(hint)) return true;   // exact echo (also covers CJK, which has no spaces)
  const overlap = said.filter(w => hintWords.has(w)).length / said.length;
  return said.length >= 4 && overlap >= 0.8;
}

app.post('/transcribe', requireUser, transcribeLimiter, dailyCap('voice'), upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error:'No audio file received' });
  const name = /\.(m4a|mp4|mp3|wav|webm|ogg|opus|flac|mpeg|mpga)$/i.test(req.file.originalname || '') ? req.file.originalname : 'voice.m4a';
  const hint = VOICE_HINTS[req.body?.lang] || VOICE_HINTS.en;
  try {
    const transcription = await groq.audio.transcriptions.create({
      file:            await toFile(req.file.buffer, name),
      model:           'whisper-large-v3-turbo',
      response_format: 'json',
      prompt:          hint,
    });
    const text = transcription.text?.trim() || '';
    res.json({ text: isEcho(text, hint) ? '' : text });
  } catch(err) {
    console.error('Transcribe error:', err.message);
    if (isGroqBusy(err)) return busy(res);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ ProteIN AI Server v2.0 on port ${PORT}`));
