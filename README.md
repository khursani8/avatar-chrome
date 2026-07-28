# Avatar Chrome

Browser-only AI avatar chat app. Uses Chrome Built-in AI (Gemini Nano) for
conversation, Piper TTS (Revolab/vits Malay voices) for speech, and PNGTuber
avatars with lip-sync. **No backend server** — everything runs in the browser.

## Features

- Browser-only — no server, no API key for the LLM
- Chat powered by Chrome Built-in AI (`LanguageModel` / Prompt API)
- Piper TTS with espeak-ng WASM phonemizer (runs in-browser via WebAssembly)
- **Speaker selection** — switch between multiple Revolab/vits voices
- PNGTuber avatars (4 sprites: mouth open/close × eyes open/close)
- Broadcast mode with green screen for OBS chroma key
- Avatar drag-to-move + scroll-to-zoom (persists per avatar)
- Custom background image
- All data stored locally (localStorage + IndexedDB)

## Requirements

- Google Chrome 138+
- Node.js 18+
- `npm`

Chrome Built-in AI must be enabled:

1. Open `chrome://flags`
2. Enable `#optimization-guide-on-device-model`
3. Enable `#prompt-api-for-gemini-nano`
4. Restart Chrome

## Setup

```bash
git clone <your-repo-url> avatar_chrome
cd avatar_chrome
npm install
```

### 1. Prepare TTS assets

```bash
node scripts/prepare-tts.mjs
```

This copies the piper-phonemize WASM binary, espeak-ng-data (Malay voice),
and ONNX Runtime Web into `public/tts/`. Run this once after `npm install`.

### 2. Download speaker models

The Revolab/vits repo is gated — login first:

```bash
huggingface-cli login   # token from https://huggingface.co/settings/tokens
```

Download one or both speakers:

```bash
hf download Revolab/vits \
  speakers/sarah/model.onnx \
  speakers/sarah/model.onnx.json \
  --local-dir ./hf-dl

mkdir -p public/tts/models/sarah
cp ./hf-dl/speakers/sarah/model.onnx      public/tts/models/sarah/
cp ./hf-dl/speakers/sarah/model.onnx.json  public/tts/models/sarah/

# Optional: second speaker
hf download Revolab/vits \
  speakers/paan/model.onnx \
  speakers/paan/model.onnx.json \
  --local-dir ./hf-dl

mkdir -p public/tts/models/paan
cp ./hf-dl/speakers/paan/model.onnx      public/tts/models/paan/
cp ./hf-dl/speakers/paan/model.onnx.json  public/tts/models/paan/
```

Then re-run the prepare script to generate the speaker manifest:

```bash
node scripts/prepare-tts.mjs
```

### 3. Add your avatar images

Generate 4 PNG images and place them in `public/avatars/default/`:

```
public/avatars/default/
├── mouth_close_eyes_open.png    ← resting state
├── mouth_close_eyes_close.png   ← blinking
├── mouth_open_eyes_open.png     ← talking
└── mouth_open_eyes_close.png    ← talking + blinking
```

See [`public/avatars/default/README.md`](public/avatars/default/README.md) for
the GPT Image 2 prompt guide. Placeholder PNGs are included for testing.

### 4. Run

```bash
npm run dev
```

Open `http://localhost:5173` in Chrome.

## How TTS works (browser-only)

```
Text → piper-phonemize WASM (espeak-ng ms voice) → phoneme IDs
     → ONNX Runtime Web (model.onnx) → Float32Array PCM
     → AudioContext playback + lip-sync
```

No server involved. The WASM phonemizer, espeak-ng-data, and ONNX model all
run client-side. First load takes a few seconds to initialize (loading ~19MB
of espeak-ng-data into WASM memory); subsequent loads are instant.

## Usage

- Type in the bottom input bar and press `Enter` to send
- `Shift+Enter` for a newline
- `Ctrl+S` / `Cmd+S` to toggle settings
- In Settings → "AI & Voice": pick speaker, adjust speech speed, edit system prompt
- Switch to broadcast mode for centered avatar on green background
- Drag avatar to reposition; scroll to zoom; double-click to reset

## Project Structure

```
src/
├── components/
│   ├── Avatar.tsx              ← PNGTuber renderer + drag/zoom
│   ├── BottomBar.tsx           ← chat input bar
│   ├── ChatLog.tsx             ← message bubbles
│   ├── SettingsPanel.tsx       ← settings (speaker dropdown, prompt, etc.)
│   └── Toast.tsx               ← error toasts
├── hooks/
│   ├── useChat.ts              ← LLM + TTS orchestration
│   ├── useSettings.ts          ← settings persistence
│   ├── useBlink.ts             ← random blink timer
│   └── useAvatarViewTransform.ts
├── services/
│   ├── llm.ts                  ← Chrome Built-in AI
│   ├── avatar.ts               ← PNGTuber avatar registry
│   ├── storage.ts              ← localStorage + IndexedDB
│   └── tts/
│       ├── phonemizer.ts       ← espeak-ng WASM (browser, MEMFS)
│       ├── piper.ts            ← Piper ONNX inference + speaker management
│       ├── playback.ts         ← audio playback + lip-sync
│       └── index.ts            ← TTS facade
├── types.ts
├── App.tsx
└── main.tsx

scripts/
└── prepare-tts.mjs             ← one-time asset setup
```

## License

MIT
