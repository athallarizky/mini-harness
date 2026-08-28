# Phase 2 — Loop + Alat Pertama

## Goal

Memberi model **tangan**: tool `read_file`, plus `while` loop yang menjalankan
permintaan tool → mengirim hasilnya balik → mengulang sampai model bilang selesai.
Setelah fase ini kamu punya agent sungguhan (versi Nakama `runConversation`,
mini). Bentuk akhirnya: `bun src/index.ts "tugas"` → agent kerjakan sendiri.

## Konsep baru

- **Tool definition** — katalog alat (`name` + `description` + `input_schema` JSON
  Schema) yang dikirim di setiap request; model HANYA bisa memakai tool yang ada di katalog
- **`tool_use` block** — model *meminta* tool dijalankan (`id`, `name`, `input`);
  model tidak pernah mengeksekusi apa pun
- **`tool_result` block** — hasil eksekusi kita, dipasangkan ke `tool_use` via
  `tool_use_id` — keduanya harus cocok, kalau tidak API menolak
- **`stop_reason`** — `"tool_use"` = model minta alat (lanjut loop);
  `"end_turn"` = tuntas (berhenti)
- **System prompt** — SOP/persona, dikirim ulang tiap request
- **Guard** — `MAX_ITERATIONS` mencegah loop tak berujung (bakar token)

## File 1 — `src/tools.ts` (baru)

```ts
import { readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";

// ===== KATALOG ALAT (yang dilihat model) =====
// Deskripsi itu BAGIAN DARI PROMPT: model memutuskan kapan memakai tool
// berdasarkan deskripsi ini. Tulis "kapan memakainya", bukan cuma "apa ini".
export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "read_file",
    description:
      "Baca isi sebuah file teks. Panggil saat kamu membutuhkan isi file " +
      "untuk menjawab atau mengerjakan tugas.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path file relatif terhadap folder jalanannya, mis. catatan.txt",
        },
      },
      required: ["path"],
    },
  },
];

// ===== EKSEKUSIOR (tangan kita) =====
// Model cuma mengirim permintaan; fungsi inilah yang benar-benar bekerja.
// Error DIKEMBALIKAN sebagai string, bukan di-throw — supaya model bisa
// membacanya dan memperbaiki diri (mis. path salah → coba path lain).
export function runTool(name: string, input: Record<string, unknown>): string {
  if (name === "read_file") {
    const path = String(input.path);
    try {
      return readFileSync(path, "utf8");
    } catch (error) {
      return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return `ERROR: tool tidak dikenal: ${name}`;
}
```

## File 2 — `src/llm.ts` (tambahkan, jangan buang yang lama)

Tambahkan di bawah yang sudah ada:

```ts
import type { MessageParam, Tool } from "@anthropic-ai/sdk";

// SOP si agent — dibacakan tiap request.
export const SYSTEM_PROMPT =
  "Kamu adalah agent terminal untuk tugas file lokal. " +
  "Gunakan tool read_file setiap kali isi file dibutuhkan — jangan menebak isinya. " +
  "Jawab ringkas dalam Bahasa Indonesia.";

// Satu pintu untuk semua panggilan model: system + tools + history lengkap.
export function ask(history: MessageParam[], tools: Tool[]) {
  return client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools,
    messages: history,
  });
}
```

> Catatan: gabungkan dua import type jadi satu baris jika sudah ada
> `import Anthropic from ...` — mis. `import type { MessageParam, Tool } from "@anthropic-ai/sdk";`

## File 3 — `src/index.ts` (timpa total — ini otaknya)

```ts
import { ask } from "./llm";
import { toolDefinitions, runTool } from "./tools";
import type { MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk";

const MAX_ITERATIONS = 10;

async function main() {
  const task = process.argv[2];
  if (!task) {
    console.error('Pakai: bun src/index.ts "tugas kamu di sini"');
    process.exit(1);
  }

  // "Buku catatan" — satu-satunya memori. Di-setiap request dikirim ULANG penuh.
  const history: MessageParam[] = [{ role: "user", content: task }];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const response = await ask(history, toolDefinitions);

    // 1) Catat balasan model APA ADANYA — termasuk block tool_use-nya.
    //    Tanpa ini, API menolak tool_result berikutnya (pasangan hilang).
    history.push({ role: "assistant", content: response.content });

    // 2) Tunjukkan bagian teks ke pengguna.
    for (const block of response.content) {
      if (block.type === "text") {
        process.stdout.write(block.text + "\n");
      }
    }

    // 3) Kalau model tidak minta tool → tuntas.
    if (response.stop_reason !== "tool_use") {
      console.log(`\n[selesai dalam ${iteration + 1} putaran]`);
      return;
    }

    // 4) Jalankan SEMUA tool call pada giliran ini.
    const results: ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        console.log(`\n🔧 ${block.name}(${JSON.stringify(block.input)})`);
        const output = runTool(block.name, block.input as Record<string, unknown>);
        results.push({
          type: "tool_result",
          tool_use_id: block.id, // wajib cocok dengan id di atas
          content: output,
        });
      }
    }

    // 5) SATU user message berisi SEMUA hasil — jangan dipisah per tool.
    history.push({ role: "user", content: results });
  }

  console.error("Batas putaran tercapai — berhenti demi keselamatan dompet.");
}

main();
```

## Mengapa begini

- **`response.content` di-push utuh** — block `tool_use` harus ada di history agar
  API menerima `tool_result`-nya; ini jebakan nomor satu pemula.
- **Error tool sebagai string** — model membaca `ERROR: ENOENT...` dan bisa
  mengoreksi sendiri (coba nama file lain). Throw = crash seluruh agent.
- **`MAX_ITERATIONS` sejak awal** — loop tanpa batas + API berbayar = tagihan.
  Nakama memakai angka 100; kita 10 karena tugas kita kecil.
- **`ask()` terpusat di `llm.ts`** — saat fase streaming nanti, cuma satu fungsi
  yang perlu diubah dari `create` ke `stream`.

## Test

```sh
echo "Hari ini aku belajar bikin agent harness dari nol. Kuncinya ternyata cuma loop plus tools. Rasanya seperti memberi tangan pada konsultan yang cuma bisa ngomong." > catatan.txt

bun src/index.ts "Baca file catatan.txt, ringkas dalam satu kalimat, lalu deskripsikan mood penulisnya"
```

**Berhasil jika:** terlihat `🔧 read_file({"path":"catatan.txt"})` dulu, lalu
ringkasan + analisis mood, ditutup `[selesai dalam 2 putaran]`.

Eksperimen tambahan (paham "memori = ilusi"):
```sh
bun src/index.ts "Baca catatan.txt, simpan isinya di kepalamu. Sebut 3 kata pertamanya."
# lalu:
bun src/index.ts "Apa 3 kata pertama catatan.txt yang kamu baca tadi?"
```
Program kedua TIDAK ingat program pertama — process baru, history baru.

**Diagnosa umum:**

| Gejala | Artinya |
|---|---|
| `tool_use ids ... without tool_result` | Kamu tidak push `response.content` utuh, atau `tool_use_id` tidak cocok |
| Model jawab tanpa baca file (ngarang) | Deskripsi tool lemah, atau tugas ambigu — perkuat SYSTEM_PROMPT |
| Loop terus tanpa selesai | Lupa cek `stop_reason`; atau tugas tak jelas "selesai"-nya seperti apa |
| `maximum context length` | File dibaca terlalu besar — nanti dibahas di fase berikutnya |

## Dependencies

- Phase 1 (`.env`, `src/llm.ts` dengan `client` + `MODEL`)
