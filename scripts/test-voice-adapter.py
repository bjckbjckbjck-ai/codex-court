"""Exercise the real Python HTTP adapter with an explicit model stand-in, not model weights."""
import io
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import wave


root = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='court-voice-adapter-') as temporary:
    folder = Path(temporary)
    source = folder / 'source'
    model = folder / 'model'
    model.mkdir()
    (model / 'cosyvoice3.yaml').write_text('test stand-in only', encoding='utf-8')
    for package in ['cosyvoice', 'cosyvoice/cli', 'cosyvoice/utils']:
        directory = source / package
        directory.mkdir(parents=True, exist_ok=True)
        (directory / '__init__.py').write_text('', encoding='utf-8')
    (source / 'cosyvoice/cli/cosyvoice.py').write_text('''import numpy as np
class Audio:
    def detach(self): return self
    def cpu(self): return self
    def numpy(self): return np.full((1, 2400), 0.1, dtype=np.float32)
class AutoModel:
    sample_rate = 24000
    def __init__(self, **kwargs): pass
    def inference_zero_shot(self, text, transcript, reference, stream=False):
        yield {"tts_speech": Audio()}
    def inference_cross_lingual(self, text, reference, stream=False):
        yield {"tts_speech": Audio()}
''', encoding='utf-8')
    (source / 'cosyvoice/utils/file_utils.py').write_text('def load_wav(file, rate): return file.read()\n', encoding='utf-8')
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    output = folder / 'adapter.log'
    with output.open('w', encoding='utf-8') as log:
        process = subprocess.Popen([sys.executable, str(root / 'scripts/cosyvoice-local.py'), '--repository', str(source), '--model-dir', str(model), '--port', str(port)], stdout=log, stderr=log, env=os.environ.copy(), creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            for _ in range(100):
                try:
                    with urllib.request.urlopen(base + '/health', timeout=1) as response:
                        assert json.load(response)['sampleRate'] == 24000
                    break
                except (OSError, urllib.error.URLError):
                    if process.poll() is not None:
                        raise AssertionError(output.read_text(encoding='utf-8'))
                    time.sleep(0.1)
            else:
                raise AssertionError('Adapter did not start')
            with urllib.request.urlopen(base + '/openapi.json') as response:
                assert '/inference_zero_shot' in json.load(response)['paths']
            ref = io.BytesIO()
            with wave.open(ref, 'wb') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(24000)
                wav.writeframes(struct.pack('<h', 1000) * 24000 * 4)
            boundary = uuid.uuid4().hex
            def post(route, with_transcript, origin=False):
                parts = []
                fields = {'tts_text': '中文测试。'}
                if with_transcript:
                    fields['prompt_text'] = 'You are a helpful assistant.<|endofprompt|>测试参考。'
                for name, value in fields.items():
                    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="prompt_wav"; filename="reference.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode() + ref.getvalue() + b'\r\n')
                parts.append(f'--{boundary}--\r\n'.encode())
                headers = {'Content-Type': f'multipart/form-data; boundary={boundary}'}
                if origin:
                    headers['Origin'] = 'https://outside.example'
                return urllib.request.urlopen(urllib.request.Request(base + route, b''.join(parts), headers), timeout=5)
            for route, transcript in [('/inference_zero_shot', True), ('/inference_cross_lingual', False)]:
                with post(route, transcript) as response:
                    assert response.headers['Content-Type'] == 'audio/wav'
                    with wave.open(io.BytesIO(response.read()), 'rb') as wav:
                        assert wav.getframerate() == 24000 and wav.getnframes() == 2400
            try:
                post('/inference_zero_shot', True, True)
                raise AssertionError('Cross-origin request was accepted')
            except urllib.error.HTTPError as error:
                assert error.code == 403
            print(json.dumps({'passed': True, 'adapterRoutes': 2, 'waveFormat': True, 'crossOriginBlocked': True, 'model': 'stand-in; actual model quality not tested'}))
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
