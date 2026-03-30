# ProteIN AI — Backend Server

Node.js + Express server. Calls Groq AI. Your API key stays safe on the server.

## Quick Start

```bash
cd ProteINServer
npm install
cp .env.example .env
# Edit .env — paste your Groq key
npm run dev
# Server at http://localhost:3000
```

## Deploy to Render (free)

1. Push ProteINServer/ to GitHub
2. render.com → New Web Service → connect repo
3. Add env var: GROQ_API_KEY = your key
4. Deploy → get URL like https://protein-ai-server.onrender.com

## Then update CoachScreen.js line 9:
const SERVER_URL = 'https://protein-ai-server.onrender.com';
