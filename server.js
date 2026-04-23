require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const multer    = require('multer');
const fs        = require('fs');
const Groq      = require('groq-sdk');

const app    = express();
const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY });
const upload = multer({ dest:'/tmp/audio/', limits:{ fileSize:10*1024*1024 } });

app.use(cors());
app.use(express.json({ limit:'15mb' }));

const chatLimiter       = rateLimit({ windowMs:60000, max:30, message:{ error:'Too many requests.' } });
const scanLimiter       = rateLimit({ windowMs:60000, max:15, message:{ error:'Too many scan requests.' } });
const transcribeLimiter = rateLimit({ windowMs:60000, max:20, message:{ error:'Too many voice requests.' } });

app.get('/', (_req,res) => res.json({ status:'ProteIN AI Server ✅' }));

app.post('/chat', chatLimiter, async (req, res) => {
  const { messages, profile } = req.body;
  if (!messages||!Array.isArray(messages)) return res.status(400).json({ error:'messages array required' });
  const goalLabels=(profile?.goals||[]).map(g=>({lose:'Lose Fat',muscle:'Build Muscle',healthy:'Stay Healthy'}[g])).filter(Boolean).join(' + ')||'General Health';
  const system=`You are a concise, friendly AI nutrition and fitness coach inside a mobile app called ProteIN AI.
IMPORTANT: You provide general wellness information only. Always remind users to consult healthcare professionals for medical advice.
USER PROFILE:
- Goals: ${goalLabels}
- Daily targets: ${profile?.goalCalories||2000} kcal | ${profile?.goalProtein||140}g protein | ${profile?.goalCarbs||200}g carbs | ${profile?.goalFat||60}g fat
- Today so far: ${profile?.todayCalories||0} kcal | ${profile?.todayProtein||0}g protein
- Meals today: ${profile?.meals?.length?profile.meals.join(', '):'None logged yet'}
${profile?.age?`- Profile: Age ${profile.age}, ${profile.weightKg?.toFixed?.(1)}kg, ${profile.heightCm}cm, ${profile.gender}`:''}
RULES: Be concise. Prioritize protein. Max 4 paragraphs. 1-2 emojis max. Never replace medical advice.`;
  try {
    const completion=await groq.chat.completions.create({model:'llama-3.1-8b-instant',messages:[{role:'system',content:system},...messages.slice(-10)],temperature:0.7,max_tokens:512});
    const reply=completion.choices[0]?.message?.content?.trim();
    if (!reply) throw new Error('Empty response');
    res.json({ reply });
  } catch(err) { console.error('Chat error:',err.message); res.status(500).json({ error:err.message }); }
});

app.post('/scan', scanLimiter, async (req, res) => {
  const { imageBase64, mimeType='image/jpeg' } = req.body;
  if (!imageBase64) return res.status(400).json({ error:'imageBase64 required' });
  const prompt=`You are a nutrition expert. Analyze this food image and identify ALL ingredients/components visible.
Return ONLY valid JSON, no markdown:
{"meal_name":"Name","ingredients":[{"name":"Chicken Breast","amount_g":150,"per_100g":{"calories":165,"protein":31,"carbs":0,"fat":4}}],"confidence":"high|medium|low","notes":"optional"}
Rules: List every visible ingredient. amount_g is estimate for this portion. per_100g uses USDA values. All integers. If cannot identify: {"error":"Cannot identify food"}`;
  try {
    const completion=await groq.chat.completions.create({
      model:'meta-llama/llama-4-scout-17b-16e-instruct',
      messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:`data:${mimeType};base64,${imageBase64}`}}]}],
      temperature:0.1,max_tokens:800,
    });
    const rawText=completion.choices[0]?.message?.content?.trim();
    if (!rawText) throw new Error('Empty response');
    const jsonText=rawText.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const parsed=JSON.parse(jsonText);
    if (parsed.error) return res.json({error:parsed.error});
    if (!parsed.ingredients?.length) throw new Error('No ingredients returned');
    const totals=parsed.ingredients.reduce((acc,ing)=>{const f=(ing.amount_g||0)/100;return{calories:acc.calories+Math.round((ing.per_100g?.calories||0)*f),protein:acc.protein+Math.round((ing.per_100g?.protein||0)*f),carbs:acc.carbs+Math.round((ing.per_100g?.carbs||0)*f),fat:acc.fat+Math.round((ing.per_100g?.fat||0)*f)};},{calories:0,protein:0,carbs:0,fat:0});
    res.json({meal_name:parsed.meal_name||'Scanned Meal',ingredients:parsed.ingredients.map(ing=>({name:ing.name||'Unknown',amount_g:Math.max(0,Math.round(ing.amount_g||0)),per_100g:{calories:Math.max(0,Math.round(ing.per_100g?.calories||0)),protein:Math.max(0,Math.round(ing.per_100g?.protein||0)),carbs:Math.max(0,Math.round(ing.per_100g?.carbs||0)),fat:Math.max(0,Math.round(ing.per_100g?.fat||0))}})),totals,confidence:parsed.confidence||'medium',notes:parsed.notes||''});
  } catch(err) { console.error('Scan error:',err.message); if (err instanceof SyntaxError) return res.status(500).json({error:'Could not parse food data.'}); res.status(500).json({error:err.message}); }
});

// Groq Whisper voice transcription — FREE with GROQ_API_KEY
app.post('/transcribe', transcribeLimiter, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error:'No audio file received' });
  const filePath = req.file.path;
  try {
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-large-v3-turbo',
      response_format: 'json',
      language: 'en',
    });
    res.json({ text: transcription.text?.trim() || '' });
  } catch(err) {
    console.error('Transcribe error:',err.message);
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(filePath, ()=>{});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ ProteIN AI Server on port ${PORT}`));
