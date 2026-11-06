# 本地角色音色与选文朗读

在 **设置 → 角色音色** 导入角色参考录音、填写角色名称和原台词，保存后可重复选用。角色库初始为空。它保存的是参考音频和配置，通过 CosyVoice 的零样本音色复制合成新台词，不需要为每个角色重新训练模型。

1. 准备 3～30 秒清晰、单人说话的片段，尽量无音乐、回声和其他人声。中文朗读优先使用中文参考录音。
2. 添加角色音色。WAV、MP3 等浏览器可解码的音频会在本机转换为单声道 PCM WAV。填写录音里实际说出的台词，不要翻译；没有对应台词或希望跨语言尝试时可选择“跨语言 / 无台词参考”。
3. 启动本机 CosyVoice 服务，在设置中选择 **CosyVoice 3**，填写 `http://127.0.0.1:50000`，保存并检测。
4. 用中文试听文本检查效果。选中聊天、导师回答或证据中的文字，点击浮动 **朗读选中文本**；已点选的 Codex 证言也可以用选句栏的 **朗读** 按钮。
5. 播放器支持暂停、继续、停止，显示分段进度。朗读时降低 BGM 音量，暂停或结束后恢复；语速与音量在设置中保存。

每次最多 5000 字，按中文标点拆成不超过 180 字的片段依次生成。首次加载模型及 CPU 推理可能较慢。停止会停止播放并取消客户端等待；部分模型服务仍会完成已经开始的计算。没有连接模型时显示错误，不会用普通系统语音冒充角色音色。

## 部署 CosyVoice 3

语音模型是独立本地服务，无须额外 API Key。法庭便携包包含连接与启动脚本，**不包含 Python 环境和模型权重**。先配置环境、下载模型，再导入录音即可使用。录音导入与保存可以在模型离线时完成。

官方依据：[CosyVoice 仓库与安装说明](https://github.com/QwenAudio/CosyVoice)、[官方 2/3 推理示例](https://github.com/QwenAudio/CosyVoice/blob/main/example.py)、[官方 FastAPI 接口](https://github.com/QwenAudio/CosyVoice/blob/main/runtime/python/fastapi/server.py)。本版对照的源代码提交为 `074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc`，模型为 `FunAudioLLM/Fun-CosyVoice3-0.5B-2512`。

推荐按官方方式使用 Linux / Conda；Windows 可使用已经配置好的 WSL2 与 Conda。NVIDIA CUDA 环境更适合频繁朗读，CPU 也可尝试但延迟取决于机器；本客户端不自动启用 WSL、修改显卡驱动或安装系统组件。

在 Linux / 已配置的 WSL2 中，进入本项目目录后运行：

```bash
bash scripts/setup-cosyvoice.sh
```

脚本会在项目 `.local/cosyvoice/` 创建独立 Python 3.10 环境，下载固定提交的官方源代码和子模块，安装官方依赖，从 ModelScope 下载模型并启动服务。首次需要网络和足够磁盘空间；音频生成阶段使用本地模型。脚本不删除现有环境，遇到不同源码提交会停下并保留文件。如果安装依赖遇到平台限制，请按官方安装说明处理。

再次启动已安装的服务，不必重新安装：

```bash
conda run --no-capture-output -p .local/cosyvoice/env python scripts/cosyvoice-local.py \
  --repository .local/cosyvoice/source --model-dir .local/cosyvoice/model
```

如果已经有原生 Windows CosyVoice 环境，在项目目录执行（替换为自己的路径）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-cosyvoice.ps1 `
  -Repository D:\CosyVoice `
  -ModelDirectory D:\CosyVoice\pretrained_models\Fun-CosyVoice3-0.5B `
  -Python D:\Environments\cosyvoice\python.exe
```

本项目的 `cosyvoice-local.py` 使用官方 `AutoModel` 和推理方法，提供零样本与跨语言两个接口，返回带采样率的 WAV。它只监听 `127.0.0.1`，不允许跨站请求，不自动下载缺失模型。服务需要保持运行。WSL 的 localhost 转发需可用，可在 Windows 中访问 `http://127.0.0.1:50000/health` 检查；不要为排障将服务公开到公网。

已有官方 FastAPI 服务也可连接。官方接口返回单声道 16 位 PCM，本客户端按设置中的采样率封装为 WAV，CosyVoice 2/3 默认选择 24000 Hz。CosyVoice 3 所需提示前缀由客户端自动添加，不需要写进参考台词。CosyVoice 2 可在设置中切换；其他协议的模型需要额外适配，不能只替换模型名称。

## 不使用角色音色时

可手动选择 **系统中文语音**。这只使用浏览器标记为本机的已安装中文音色，不会发送到在线语音服务，也不会复制角色声音。如果列表为空，需要在 Windows 语言设置中安装中文语音包，或使用本地 CosyVoice。

## 本地数据与验收范围

音色元数据、参考台词和录音保存在 `DATA_FILE + '.speech/'`，默认 `.local/court.json.speech/`。这整个目录属于私有存档；不会进入源码仓库或便携发布包。升级时保留 `.local`，音色和默认选择即可继续使用。删除角色会同时移除本机参考音频；合成的朗读音频只暂存在浏览器内存中。音色库独立于 Codex 工作会话，不向工作会话发送朗读或复制请求。

自动化验收使用独立的协议模拟服务和合成测试音，检查音色导入、保存、选文、音频解码、播放控制和配乐恢复。这不等同于真实角色相似度测试；后续导入实际角色录音并部署模型后，以中文试听确认发音和音色效果。
