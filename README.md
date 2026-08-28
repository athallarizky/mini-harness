# mini-harness

A minimal AI agent harness — an LLM in a loop with tools, streaming, and a REPL.
Built from scratch in ~180 lines of TypeScript to understand how coding agents
like Claude Code actually work.

No framework. No orchestration library. Just the official `@anthropic-ai/sdk`
and a `while` loop you can read in one sitting.

## What it does

```
$ bun src/index.ts
mini-harness REPL — /exit to quit, /reset to clear memory

you> Read package.json and list the dependencies
 🔧 read_file({"path":"package.json"})
It depends on @anthropic-ai/sdk (runtime) and @types/bun (dev).
[finished in 1 round(s)]

you> Now fetch https://example.com and tell me the page title
 🔧 web_fetch({"url":"https://example.com"})
The page title is "Example Domain".
[finished in 2 round(s)]

you> /exit
Goodbye! 👋
```

- **Agent loop** — the model decides which tools to call, looping until the task is done
- **Four tools** — `read_file`, `write_file`, `list_files`, `web_fetch`
- **Parallel tool calls** — multiple tools execute concurrently in one turn
- **Streaming** — replies print token-by-token as SSE deltas arrive
- **Session memory** — conversation persists across turns; `/reset` wipes it
- **Self-correcting tools** — errors return as strings so the model can read them and recover

## Quick start

Requires [Bun](https://bun.com) and any Anthropic-compatible endpoint.

```sh
git clone https://github.com/athallarizky/mini-harness
cd mini-harness
bun install
cp .env.example .env    # fill in your endpoint, key, and model
bun src/index.ts
```

### Configuration

| Variable | Meaning |
|---|---|
| `ANTHROPIC_BASE_URL` | Any Anthropic-compatible endpoint (`https://api.anthropic.com`, Z.ai, ...) |
| `ANTHROPIC_API_KEY` | API key for that endpoint |
| `MODEL` | Model name the endpoint serves |

Works with Anthropic directly or any gateway that speaks the Messages API format.

## Architecture — three files

| File | Role |
|---|---|
| `src/llm.ts` | **Translator** — SDK client, system prompt, single `ask()` entry point (streaming) |
| `src/tools.ts` | **Hands** — tool catalog (JSON Schema) + executor with input validation |
| `src/index.ts` | **Brain** — a REPL loop wrapped around the agent loop |

```
user turn ──▶ history ──▶ ask() ──▶ [ model ]
                ▲                     │ stream (SSE)
                │                     ▼
        tool_result ◀── runTool() ◀── tool_use
                │     (parallel)
                └────── loop until stop_reason !== "tool_use"
```

The agent's entire "memory" is one `MessageParam[]` — re-sent in full on every
request. Nothing is persisted to disk.

## Learning path

This repo was built phase by phase as a learning exercise. The step-by-step
guides — full explanations, code walkthroughs, and experiments for each phase —
live on the [`docs` branch](https://github.com/athallarizky/mini-harness/tree/docs/docs):

1. **Connection** — SDK client, env config, first message
2. **The loop** — agent loop + the first tool (`read_file`)
3. **Four tools** — `write_file`, `list_files`, `web_fetch` + parallel execution
4. **Streaming** — `create` → `stream`, SSE deltas, `finalMessage()`
5. **REPL** — multi-turn conversation, session memory, `/reset`

## Design notes

- **Memory is an array** — cross-turn "memory" is just the history array living
  for the whole process; wipe it and the agent has instant amnesia
- **Errors are data** — tools return `ERROR: ...` strings instead of throwing,
  so the model can read the failure and correct itself on the next round
- **The catalog is the prison** — the model can only call tools listed in
  `toolDefinitions`, no matter what the executor supports
- **One entry point** — every model call goes through `ask()`, which is why the
  streaming migration was a one-function change
