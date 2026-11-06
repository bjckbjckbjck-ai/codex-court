#!/usr/bin/env bash
# Optional model installation for Linux / an existing WSL2 environment with Conda.
set -euo pipefail
COURT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VOICE_ROOT="$COURT_ROOT/.local/cosyvoice"
VOICE_REVISION="074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc"
command -v conda >/dev/null || { echo 'Install/activate Conda first; see docs/voice.md.' >&2; exit 1; }
command -v git >/dev/null || { echo 'Git is required.' >&2; exit 1; }
mkdir -p "$VOICE_ROOT"
if [[ ! -d "$VOICE_ROOT/source" ]]; then
  git clone https://github.com/QwenAudio/CosyVoice.git "$VOICE_ROOT/source"
  git -C "$VOICE_ROOT/source" checkout "$VOICE_REVISION"
elif [[ "$(git -C "$VOICE_ROOT/source" rev-parse HEAD)" != "$VOICE_REVISION" ]]; then
  echo 'Existing CosyVoice source has a different revision. It was left unchanged.' >&2
  exit 1
fi
git -C "$VOICE_ROOT/source" submodule update --init --recursive
if [[ ! -x "$VOICE_ROOT/env/bin/python" ]]; then
  conda create -p "$VOICE_ROOT/env" python=3.10 -y
fi
conda run -p "$VOICE_ROOT/env" python -m pip install -r "$VOICE_ROOT/source/requirements.txt"
conda run -p "$VOICE_ROOT/env" python -c 'import sys; from modelscope import snapshot_download; snapshot_download("FunAudioLLM/Fun-CosyVoice3-0.5B-2512", local_dir=sys.argv[1])' "$VOICE_ROOT/model"
echo 'Model installed. Starting the local voice service at http://127.0.0.1:50000'
exec conda run --no-capture-output -p "$VOICE_ROOT/env" python "$COURT_ROOT/scripts/cosyvoice-local.py" --repository "$VOICE_ROOT/source" --model-dir "$VOICE_ROOT/model"
