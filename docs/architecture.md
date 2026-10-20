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

Windows data directory: https://learn.chatgpt.com/docs/windows/windows-app
