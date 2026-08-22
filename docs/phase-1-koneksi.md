# Phase 1 — Koneksi

## Goal

Project hidup, terhubung ke model lewat gateway Z.ai, dan berhasil mengirim satu pesan
lalu mencetak balasan + metadatanya. Belum ada tools, belum ada loop — pastikan pipa
airnya jalan dulu sebelum pasang keran.

## Konsep baru

- **Env config** — rahasia (API key) TIDAK pernah ditulis di kode, hanya di `.env`
- **Auto-load** — Bun otomatis membaca `.env`; SDK otomatis membaca
  `ANTHROPIC_API_KEY` dan `ANTHROPIC_BASE_URL`
- **Content block union** — `response.content` adalah array block bertipe;
  akses `block.text` tanpa cek `block.type` = error TypeScript (disengaja!)
- **Metadata response** — `stop_reason`, `usage` (token masuk/keluar = uang)

## Langkah 1 — Init project

```sh
cd ~/development/personal/mini-harness
bun init -y
bun add @anthropic-ai/sdk
bun add -d @types/bun
```

## Langkah 2 — File `.env` (di root project)

```sh
ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
ANTHROPIC_API_KEY=ganti-dengan-api-key-zai-kamu
MODEL=glm-4.7
```

> Endpoint ini **terverifikasi 2026-08-22** (path lama `/api/coding/anthropic` sudah
> mati — 404 dibungkus 500). Model yang tersedia di plan saat itu: `glm-4.5`,
> `glm-4.5-air`, `glm-4.6`, `glm-4.7`, `glm-5`. Daftar lengkap bisa dicek:
> `curl -H "Authorization: Bearer $ANTHROPIC_API_KEY" https://api.z.ai/api/coding/paas/v4/models`
> Nanti kalau mau pindah ke Anthropic asli: ganti `ANTHROPIC_BASE_URL` jadi
> `https://api.anthropic.com` + key dari console.anthropic.com. Kode tidak berubah.

## Langkah 3 — File `.gitignore` (di root project)

```sh
node_modules
.env
```

## Langkah 4 — `src/llm.ts`

```ts
import Anthropic from "@anthropic-ai/sdk";

// SDK otomatis membaca ANTHROPIC_API_KEY dan ANTHROPIC_BASE_URL dari environment,
// dan Bun otomatis me-load file .env di root project. Konstruktor kosong = cukup.
// Ini pola "provider adapter" sederhana: kode harness tidak peduli backend-nya siapa.
export const client = new Anthropic();

// Nama model ikut plan-mu — satu-satunya tempat yang perlu diganti saat pindah provider.
const model = process.env.MODEL;
if (!model) {
  throw new Error("Set MODEL di .env dulu (lihat docs/phase-1-koneksi.md).");
}
export const MODEL = model;
```

## Langkah 5 — `src/index.ts`

```ts
import { client, MODEL } from "./llm";

async function main() {
  // messages = "buku catatan". Fase ini isinya baru satu pesan.
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      { role: "user", content: "Kenalkan dirimu dalam satu kalimat." },
    ],
  });

  // content = ARRAY block bertipe (union). Selalu cek .type dulu —
  // ini kebiasaan yang akan dipakai di semua fase berikutnya.
  for (const block of response.content) {
    if (block.type === "text") {
      process.stdout.write(block.text);
    }
  }

  console.log("\n\n--- metadata ---");
  console.log(`model        : ${response.model}`);
  console.log(`stop_reason  : ${response.stop_reason}`);
  console.log(`tokens in/out: ${response.usage.input_tokens}/${response.usage.output_tokens}`);
}

main();
```

## Mengapa begini

- **`llm.ts` terpisah dari `index.ts`** — sejak awal pisahkan "cara ngomong ke model"
  dari "otak loop". Di Nakama ini beda `providers/*` vs `chat.ts`.
- **`process.stdout.write`** (bukan `console.log`) — tanpa newline, supaya nanti di
  fase streaming teks mengalir mulus per delta.
- **Kunci & URL via env** — file ini bisa di-commit ke GitHub tanpa bocor rahasia.

## Test

```sh
bun src/index.ts
```

**Berhasil jika:** muncul satu kalimat perkenalan + metadata `stop_reason: end_turn`
+ angka token.

**Diagnosa umum:**

| Gejala | Artinya |
|---|---|
| `401` / authentication_error | API key salah / belum diganti dari placeholder |
| `404` model not found | Nama `MODEL` tidak ada di plan Z.ai-mu — cek dashboard |
| `fetch failed` | `ANTHROPIC_BASE_URL` salah tulis |
| Error `Set MODEL di .env` | File `.env` bukan di root project, atau lupa dibuat |

## Dependencies

Tidak ada — fase pertama.
