#!/usr/bin/env bash
# Deploy a talking-avatar build to Cloudflare Pages.
#
# The two Piper models (~61MB each) exceed every free static host's 25MB/file
# limit, so they are fetched at runtime from a public HuggingFace repo
# (Revolab/vits) — see VITE_TTS_MODEL_BASE / src/services/tts/piper.ts.
# Only the app shell + ONNX runtime + espeak-ng-data + phonemizer are uploaded.
#
# Prereq: `npx wrangler login` (one-time).
set -euo pipefail

: "${VITE_TTS_MODEL_BASE:=https://huggingface.co/Revolab/vits/resolve/main/speakers/}"
export VITE_TTS_MODEL_BASE

echo "==> Building (models from ${VITE_TTS_MODEL_BASE})"
npm run build

echo "==> Pruning deploy output"
# Local Piper models (present on disk) are fetched from HF at runtime — drop them.
rm -rf dist/tts/models/paan dist/tts/models/sarah
# The 26MB WebGPU/JSEP wasm exceeds Cloudflare's 25MB/file limit and is unused
# by the CPU wasm execution provider (executionProviders: ["wasm"]).
rm -f dist/tts/dist/ort-wasm-simd-threaded.jsep.wasm

echo "==> Deploying to Cloudflare Pages (project: avatar-chrome)"
npx wrangler pages deploy dist --project-name=avatar-chrome --commit-dirty=true
