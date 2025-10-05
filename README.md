```markdown
# AI Interview System

音声・テキストで対話できるAI面接システム。
3Dアバターが面接官として質問し、候補者を評価します。

## Features

- 🎤 音声入力（Whisper API）
- 🔊 音声出力（OpenAI TTS）
- 💬 AI対話（Claude 3 Haiku）
- 👤 3Dアバター（Ready Player Me）
- 📊 5項目評価システム

## Tech Stack

**Frontend**
- Next.js 15.5.4
- React 18.2.0
- TypeScript
- Tailwind CSS
- Three.js
- Socket.IO Client

**Backend**
- NestJS 10.x
- TypeScript
- Socket.IO
- Anthropic SDK（Claude 3 Haiku）
- OpenAI SDK（Whisper, TTS）

## Architecture

```
Browser (Next.js)
    ↓ WebSocket
Backend (NestJS)
    ↓ API
Claude Haiku / Whisper / TTS
```

## Setup

### Prerequisites

- Node.js v22.14.0
- OpenAI API Key
- Anthropic API Key

### Installation

1. Clone the repository

```bash
git clone [your-repo-url]
cd ai-interview-system
```

2. Setup environment variables

Create `backend/.env`:

```bash
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

3. Start backend

```bash
cd backend
npm install
npm run start
# Runs on http://localhost:3001
```

4. Start frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

## Project Structure

```
ai-interview-system/
├── backend/              # NestJS backend
│   ├── src/
│   │   ├── main.ts
│   │   └── audio/
│   │       ├── audio.gateway.ts      # WebSocket
│   │       ├── chat.service.ts       # Claude integration
│   │       └── evaluation.service.ts # Evaluation logic
│   └── temp/             # Temporary audio files
│
└── frontend/             # Next.js frontend
    └── src/
        └── app/
            ├── page.tsx              # Main UI
            └── components/
                └── AvatarView.tsx    # 3D Avatar
```

## How It Works

1. User speaks → Microphone records audio
2. Audio → Whisper API → Text transcription
3. Text → Claude API → AI response
4. AI response → TTS API → Audio
5. Audio → Auto-plays in browser

## License

MIT
```