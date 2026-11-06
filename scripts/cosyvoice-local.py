"""Loopback-only CosyVoice 2/3 adapter. Run inside an installed CosyVoice environment."""
import argparse
import io
import os
from pathlib import Path
import sys
import threading
import wave


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', required=True)
    parser.add_argument('--model-dir', required=True)
    parser.add_argument('--port', type=int, default=50000)
    args = parser.parse_args()
    repository = Path(args.repository).resolve()
    model_dir = Path(args.model_dir).resolve()
    if not (repository / 'cosyvoice').is_dir():
        parser.error('Repository must point to the installed official CosyVoice source.')
    if not any((model_dir / name).is_file() for name in ['cosyvoice3.yaml', 'cosyvoice2.yaml']):
        parser.error('Download the CosyVoice 2/3 model into model-dir first.')
    if not 1024 <= args.port <= 65535:
        parser.error('Port must be between 1024 and 65535.')
    sys.path[:0] = [str(repository), str(repository / 'third_party' / 'Matcha-TTS')]
    os.chdir(repository)
    from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
    from fastapi.responses import Response
    import numpy as np
    import uvicorn
    from cosyvoice.cli.cosyvoice import AutoModel
    from cosyvoice.utils.file_utils import load_wav

    model = AutoModel(model_dir=str(model_dir))
    app = FastAPI(title='Codex Court local CosyVoice', version='1')
    lock = threading.Lock()

    @app.middleware('http')
    async def local_only(request: Request, call_next):
        host = request.headers.get('host', '')
        if host not in {f'127.0.0.1:{args.port}', f'localhost:{args.port}'} or request.headers.get('origin') or request.headers.get('sec-fetch-site') == 'cross-site':
            return Response(status_code=403)
        length = request.headers.get('content-length', '')
        if request.method == 'POST' and (not length.isdigit() or int(length) > 3_100_000):
            return Response(status_code=413)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/health')
    def health():
        return {'ready': True, 'model': type(model).__name__, 'sampleRate': model.sample_rate}

    def generate(tts_text, prompt_wav, prompt_text=None):
        if not 1 <= len(tts_text.strip()) <= 400 or (prompt_text is not None and len(prompt_text) > 2200):
            raise HTTPException(400, 'Text is empty or too long.')
        data = prompt_wav.file.read(3_000_001)
        if len(data) > 3_000_000:
            raise HTTPException(413, 'Reference is too large.')
        try:
            with wave.open(io.BytesIO(data), 'rb') as ref:
                duration = ref.getnframes() / ref.getframerate()
                if ref.getnchannels() != 1 or ref.getsampwidth() != 2 or not 3 <= duration <= 30.01:
                    raise ValueError('reference format')
        except (wave.Error, ValueError, EOFError):
            raise HTTPException(400, 'Use a 3-30 second mono PCM16 WAV reference.')
        if not lock.acquire(blocking=False):
            raise HTTPException(409, 'A voice is already being generated.')
        try:
            reference = load_wav(io.BytesIO(data), 16000)
            if prompt_text is None:
                output = model.inference_cross_lingual(tts_text, reference, stream=False)
            else:
                output = model.inference_zero_shot(tts_text, prompt_text, reference, stream=False)
            pcm = bytearray()
            for item in output:
                audio = item['tts_speech'].detach().cpu().numpy().reshape(-1)
                pcm.extend((np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes())
                if len(pcm) > 23_000_000:
                    raise HTTPException(413, 'Generated audio is too long.')
            if not pcm:
                raise HTTPException(502, 'Model produced no audio.')
            buffer = io.BytesIO()
            with wave.open(buffer, 'wb') as result:
                result.setnchannels(1)
                result.setsampwidth(2)
                result.setframerate(model.sample_rate)
                result.writeframes(bytes(pcm))
            return Response(content=buffer.getvalue(), media_type='audio/wav')
        finally:
            lock.release()

    @app.post('/inference_zero_shot')
    def zero_shot(tts_text: str = Form(...), prompt_text: str = Form(...), prompt_wav: UploadFile = File(...)):
        return generate(tts_text, prompt_wav, prompt_text)

    @app.post('/inference_cross_lingual')
    def cross_lingual(tts_text: str = Form(...), prompt_wav: UploadFile = File(...)):
        return generate(tts_text, prompt_wav)

    uvicorn.run(app, host='127.0.0.1', port=args.port, access_log=False)


if __name__ == '__main__':
    main()
