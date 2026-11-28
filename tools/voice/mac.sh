#!/bin/bash
# Makes the sound of every wiki voiceover on a Mac, in one go, uploading nothing (tools/voice/local.mjs).
# Run it from anywhere:
#   bash <(curl -fsSL https://raw.githubusercontent.com/ashrawan/codegrave/claude/project-thread-a9lcvq/tools/voice/mac.sh)
# It keeps its own copy of the repository in ~/codegrave-voice (your own checkout is not touched), installs
# what it needs (Homebrew's ffmpeg and node if missing, then the voice tool), keeps the Mac awake, and writes
# the MP3s to ~/codegrave-voice/tools/voice/out. Running it again carries on where it stopped.
set -euo pipefail
trap 'echo; echo "STOPPED: the step above failed (mac.sh line $LINENO). Send Claude the lines above."' ERR
BRANCH=claude/project-thread-a9lcvq
HERE="${CODEGRAVE_VOICE_DIR:-$HOME/codegrave-voice}"

say() { printf '\n== %s\n' "$*"; }
if ! command -v brew >/dev/null && { ! command -v ffmpeg >/dev/null || ! command -v node >/dev/null; }; then
  echo "Needs Homebrew (https://brew.sh) to install ffmpeg or node."; exit 1
fi
command -v ffmpeg >/dev/null || { say "installing ffmpeg"; brew install ffmpeg; }
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  say "installing node 22"; brew install node@22; export PATH="$(brew --prefix node@22)/bin:$PATH"
fi

if [ -d "$HERE/.git" ]; then
  say "updating the tools in $HERE (the voiceovers made so far are kept)"
  git -C "$HERE" fetch --quiet --depth 1 origin "$BRANCH"
  git -C "$HERE" checkout --quiet FETCH_HEAD -- . ':(exclude)data/community/wiki/voices'
else
  say "copying the repository to $HERE"
  git clone --quiet --depth 1 --branch "$BRANCH" https://github.com/ashrawan/codegrave.git "$HERE"
fi
cd "$HERE"

say "installing the voice tool"
(cd tools/voice && npm install --no-audit --no-fund --onnxruntime-node-install-cuda=skip)

say "making the voiceovers (the Mac stays awake until it is done)"
caffeinate -i node tools/voice/local.mjs "$@"
