require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const Groq      = require('groq-sdk');

const app  = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json());

// Rate limiting — 30 req/min per IP (matches Groq free tier)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  message: { error: 'Too many requests. Please wait a moment.' },
});
app.use('/chat', limiter);

// Health check
app.get('/', (_req, res) => res.json({ status: 'ProteIN AI Server ✅', model: 'llama-3.1-70b-versatile' }));

// ── Main AI chat endpoint ──────────────────────────────────────────────────
app.post('/chat', async (req, res) => {
  const { messages, profile } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const goalLabels = (profile?.goals || [])
    .map(g => ({ lose: 'Lose Fat', muscle: 'Build Muscle', healthy: 'Stay Healthy' }[g]))
    .filter(Boolean)
    .join(' + ') || 'General Health';

  const system = `You are a concise, friendly AI nutrition and fitness coach inside a mobile app called ProteIN AI.

USER PROFILE:
- Goals: ${goalLabels}
- Daily targets: ${profile?.goalCalories || 2000} kcal | ${profile?.goalProtein || 140}g protein | ${profile?.goalCarbs || 200}g carbs | ${profile?.goalFat || 60}g fat
- Today so far: ${profile?.todayCalories || 0} kcal eaten | ${profile?.todayProtein || 0}g protein consumed
- Meals today: ${profile?.meals?.length ? profile.meals.join(', ') : 'None logged yet'}
${profile?.age ? `- Profile: Age ${profile.age}, ${profile.weightKg?.toFixed?.(1) || '?'}kg, ${profile.heightCm || '?'}cm, ${profile.gender}` : ''}

RULES:
- Be concise — max 4 short paragraphs or a short bullet list. Never ramble.
- Always prioritize protein advice (it is the app's core focus).
- Give specific, actionable suggestions with real food examples and gram amounts.
- Use 1–2 emojis max per reply, naturally placed.
- If the user already hit their protein goal today, congratulate them warmly and suggest a next step.
- Never recommend anything extreme, unsafe, or medically specific.`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-70b-versatile',
      messages: [
        { role: 'system', content: system },
        ...messages.slice(-10), // keep last 10 messages for context
      ],
      temperature: 0.7,
      max_tokens: 512,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) throw new Error('Empty response from Groq');

    res.json({ reply });
  } catch (err) {
    console.error('Groq error:', err.message);
    res.status(500).json({ error: err.message || 'AI request failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ ProteIN AI Server on port ${PORT}`));
