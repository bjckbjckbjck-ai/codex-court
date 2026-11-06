# Architecture

```
Independent Edge / Chrome app window
    → same-origin HTTP + SSE on 127.0.0.1
    → Node.js built-in HTTP server
    → owned codex app-server process over stdio JSON-RPC
    → user's existing Codex login / config / local conversations
```

The browser never receives auth.json, an API key or an unrestricted JSON-RPC proxy. The backend exposes bounded application routes, validates local origin and uses a random session token plus HttpOnly SameSite cookie. The frontend sanitizes model Markdown and disables external image loading. Source files, key.txt and private state are outside the static document root.

`server/rpc.mjs` owns exactly one child process. It initializes the official protocol, correlates requests, forwards notifications and terminates only its own child. Configuration is inherited through Codex itself. A configurable proxy mode may attach to an existing daemon when one is available; default operation uses a new process, so cross-process locks matter.

`server/index.mjs` keeps loaded thread IDs, active turn IDs and pending approvals. Viewing a thread calls read APIs only. The first send resumes it by its original ID. It never deletes, ignores or edits another process's thread-writer lock. ChatGPT account metadata is reduced to type and plan before being sent to the page. Provider keys and raw Codex stderr are not exposed.

`server/store.mjs` stores evidence and examination links atomically using a serialized write queue and a replace operation. Evidence is bounded and fingerprinted with SHA-256. Examinations retain the original quote, message and turn IDs, evidence IDs/titles/hashes, subsequent turn ID and a user-selected result label. Removing a card preserves the reference in prior examinations. The evidence content that was actually submitted remains in the original Codex turn.

`src/App.jsx` consumes SSE, supports reconnect and history pagination, keeps drafts intact on failed sends and renders tool and approval events separately from the visible answer. It does not expose hidden reasoning. Statement ranges use message and turn IDs, independent of DOM ordering. Quoted text and evidence are explicitly framed as material to inspect rather than new system instructions.

The training conversation is an explicitly labeled local simulation. It uses deterministic scripted replies and never invokes the model. Browser QA requires an independent DATA_FILE and Chrome/Edge temporary profiles. Test-only reset routes do not exist in normal mode.

Known boundaries: desktop-host dynamic tools, remote/cloud conversation providers and simultaneous writers across independent App Server processes are not emulated. Unknown host actions fail explicitly instead of being fabricated. Native command/file-change approvals and structured user questions are supported. Other permission/elicitation types are denied or cancelled with a notice.

Protocol reference: https://learn.chatgpt.com/docs/app-server

## Mentor (1.3)

`server/mentor.mjs` keeps a distinct native Codex thread per source conversation, or a separate general-study thread. The panel is loaded without starting a model turn. Its first submitted question starts a thread with the source project's working directory, `sandbox: read-only`, approval policy `never`, and the tutoring developer instructions. Resume restores these constraints; each teaching turn also explicitly requests a read-only sandbox. Original work threads are only read for their project metadata, never resumed or written by the tutor.

Mentor thread IDs, learning preferences and user-edited cards persist in `DATA_FILE + '.mentor.json'`. Native Codex retains the actual teaching conversation. Selected context is explicitly quoted material; optional evidence images use real image inputs. SSE events carry a mentor-session identifier so early streaming replies and terminal responses remain scoped correctly. Training uses a clearly labeled deterministic fixture, with no model calls.

The 1.3.1 UI uses a small draggable character and a bounded speech bubble showing the latest teaching turn. The overlay is pointer-transparent outside the character and bubble. Position is stored locally, clamped on resize, and the bubble flips sides near viewport edges. Native dialogs temporarily hide the assistant. Existing cards/preferences/history remain intact in the backend; their management panels are hidden in this simplified interface. A new reply can open the bubble once per turn without repeatedly reopening it during streaming.

Audio focus is separate from the underlying courtroom phase. Evidence inspection and the expanded mentor bubble request the logic phase only when automatic music is enabled; closing them reveals the current underlying phase. A collapsed character does not request logic music. Pause and mute settings continue to apply. Fast questioning has its own slot; existing slow questioning IDs remain compatible.

Windows data directory: https://learn.chatgpt.com/docs/windows/windows-app

## Local voice profiles (1.4)

`server/speech.mjs` stores role metadata, reference transcripts and PCM WAV references in `DATA_FILE + '.speech/'`. Profiles are atomic local records; selected text is not added to Codex threads. Browser audio decoding converts imports to mono 24 kHz WAV; the backend independently verifies size, duration, PCM format and non-silence. Imports work without a running model. Deleting the selected voice clears its selection rather than choosing a different identity silently.

Authenticated same-origin speech routes proxy only fixed CosyVoice endpoints at literal loopback addresses. Redirects, credential URLs and non-loopback hosts are rejected. Bounded synthesis receives multipart reference audio and model-specific prompts, validates WAV responses or wraps official raw PCM as WAV. It has timeout, cancellation and single-request concurrency limits. The optional Python adapter uses official AutoModel methods and only binds loopback, with cross-origin protection and request limits. Model weights and Python are an optional separate installation, never part of the public release.

`useSpeech` owns one player and a generation token, aborting old requests and rejecting late playback after stop. Chinese punctuation and bounded chunks are processed sequentially; audio stays in browser memory. System TTS is explicitly optional and uses only local Chinese voices. Speech pauses/ends restore the configured BGM volume without changing its saved volume or pause preference. Selection and playback controls enter the active dialog's top layer when inspecting evidence. Tests use explicit synthetic protocol fixtures, not claims of actual voice-cloning quality.
