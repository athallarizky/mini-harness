# Mini Harness — Plan

## Apa yang kita bangun

Agent harness minimalis dari nol dengan TypeScript + Bun: satu loop percakapan yang
memberi LLM kemampuan memakai tools (baca/tulis file, list folder, fetch web) untuk
menyelesaikan tugas one-shot, lalu di fase akhir di-upgrade jadi chat REPL interaktif.
Ini versi mini dari `packages/agent/src/chat.ts` milik Nakama — ditulis tangan sendiri.

**Provider:** Z.ai coding plan (payload-format Anthropic) via SDK resmi
`@anthropic-ai/sdk` + `baseURL` custom. Ganti 3 baris `.env` dan kode yang sama jalan
di `api.anthropic.com` atau gateway Anthropic-compatible mana pun.

## Konsep yang akan dipelajari

| Konsep | Artinya (bahasa awam) |
|---|---|
| Message / role | Satu entri di percakapan: `user` (kita/hasil tool) atau `assistant` (model) |
| Content block | Isi pesan berupa array block bertipe (`text`, `tool_use`, `tool_result`) — union type |
| Tool definition | "Katalog alat" yang dikirim ke model: nama + deskripsi + JSON Schema input |
| Tool call (`tool_use`) | Model **meminta** tool dijalankan — cuma teks permintaan, bukan eksekusi |
| Tool result (`tool_result`) | Hasil eksekusi tool yang kita kirim balik, dipasangkan via `tool_use_id` |
| Stop reason | Kenapa model berhenti: `end_turn` (selesai) vs `tool_use` (minta tool) |
| Agent loop | `while` loop: kirim → jika ada tool call → jalankan → kirim hasil → ulangi |
| History array | "Buku catatan" — SATU-SATUNYA memori; dikirim ulang penuh tiap request |
| System prompt | SOP/persona yang dibacakan di awal, tiap request |
| Streaming (SSE) | Jawaban datang bertahap per delta, bukan sekali jadi |
| Parallel tool calls | Model minta beberapa tool sekaligus dalam satu giliran |
| Guard `max_iterations` | Batas putaran loop supaya model tak berputar selamanya (bakar duit) |
| Provider adapter | Kode harness sama, endpoint/model beda — hanya beda config |

## Diagram arsitektur

```
┌─────────────── Terminal (kamu) ───────────────┐
│  $ bun src/index.ts "ringkas semua .md di sini"│
└──────────────────────┬────────────────────────┘
                       │
                       ▼
┌───────────── src/index.ts (LOOP UTAMA) ───────┐
│  history = [user(task)]                        │
│  while (iterations < MAX):                     │
│    1. response = llm.send(history, tools)      │
│    2. history.push(assistant)                  │
│    3. jika stop_reason == "end_turn" → selesai │
│    4. hasil = tools.run(tool_calls)  ──────────┼──┐
│    5. history.push(tool_result)                │  │
└──────────────┬─────────────────────────────────┘  │
               │                                    ▼
               ▼                        ┌─ src/tools.ts (TANGAN)
┌──────── src/llm.ts (PENERJEMAH) ──────┤  read_file(path)
│  SDK @anthropic-ai/sdk                │  write_file(path, content)
│  baseURL+key dari .env (Z.ai)         │  list_files(dir)
│  system prompt + tools + history  ────┤  web_fetch(url)
└──────────────┬────────────────────────┘  setiap tool: schema + run()
               │ HTTPS (format Anthropic)
               ▼
      [ Z.ai gateway → model GLM ]
```

## Struktur project

```
mini-harness/
├── .env                  # ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY, MODEL  (rahasia!)
├── .gitignore            # node_modules, .env
├── package.json
├── docs/
│   ├── plan.md           # file ini
│   ├── phase-1-koneksi.md
│   ├── phase-2-loop.md
│   ├── phase-3-tools.md
│   ├── phase-4-streaming.md
│   └── phase-5-repl.md
└── src/
    ├── llm.ts            # client SDK + system prompt + kirim history
    ├── tools.ts          # definisi + eksekusi semua tool
    └── index.ts          # loop utama (satu-satunya "otak")
```

## Skema state (data flow per putaran)

State keseluruhan harness = **satu array `messages`**. Bentuk isinya:

```ts
// giliran user (tugas awal)
{ role: "user", content: "ringkas notes.md" }

// balasan model yang minta tool — content = array block
{ role: "assistant", content: [
    { type: "text", text: "Aku baca filenya dulu." },
    { type: "tool_use", id: "toolu_01", name: "read_file",
      input: { path: "notes.md" } },
]}

// hasil tool dari kita — SATU user message berisi semua hasil paralel
{ role: "user", content: [
    { type: "tool_result", tool_use_id: "toolu_01",
      content: "isi file notes.md..." },
]}

// ... dst, sampai model balas tanpa tool_use → stop_reason "end_turn"
```

## Roadmap fase

1. **Koneksi** — project init, `.env`, client SDK, kirim 1 pesan, cetak balasan.
   *Konsep: env config, content block union, usage/stop_reason.*
2. **Loop + alat pertama** — `read_file` + `while` loop lengkap (jantung harness).
   *Konsep: tool schema, tool_use/tool_result, stop reason, system prompt.*
3. **Empat tools + paralel** — `write_file`, `list_files`, `web_fetch`; beberapa
   tool per giliran dalam satu `tool_result` message; guard `MAX_ITERATIONS`.
4. **Streaming** — `create` → `stream`; teks tercetak per delta, aktivitas tool terlihat.
   *Konsep: event SSE (`content_block_delta`), buffer output.*
5. **REPL interaktif** — readline multi-turn, history persisten antar giliran user,
   `/exit`. *Konsep: state lintas giliran, "memori = ilusi".*

Aturan main (dari `agent-playbooks/ai-guided-learning`): **kamu menulis semua kode,
aku hanya memandu.** Tiap fase harus jalan dulu sebelum lanjut.
