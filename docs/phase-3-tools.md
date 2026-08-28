# Phase 3 — Empat Tools + Paralel

## Goal

Melengkapi tangan agent: dari cuma bisa membaca (`read_file`) jadi bisa **menulis
file** (`write_file`), **menjelajah folder** (`list_files`), dan **mengambil web**
(`web_fetch`). Sekalian membuka kemampuan yang sudah tertanam diam-diam di loop
phase 2: model memanggil **beberapa tool sekaligus dalam satu giliran** — sekarang
kita eksekusi **bersamaan** (paralel).

Setelah fase ini, `bun src/index.ts "ringkas semua .md di folder ini dan tulis
ke ringkasan.txt"` benar-benar bisa dijalankan tanpa kamu menyentuh apa pun.

## Konsep baru

- **Tool mutasi vs tool baca** — `read_file`/`list_files`/`web_fetch` hanya
  melihat dunia; `write_file` **mengubah** dunia. Tool mutasi butuh kehati-hatian
  ekstra: input salah = file korup/tertimpa
- **Validasi input** — `input` dari model itu JSON bebas; model BISA mengirim
  tipe salah atau parameter hilang. `String(undefined)` = `"undefined"` — bug
  sunyi yang menulis sampah ke file tanpa error sekalipun
- **Async tool** — `web_fetch` menunggu jaringan → `runTool` berubah jadi
  `async`, pemanggilnya ikut `await` ("async is contagious")
- **Paralel tool calls** — satu balasan model bisa berisi ≥1 block `tool_use`;
  semua hasilnya tetap wajib masuk **SATU** user message (aturan API).
  `Promise.all` mengeksekusinya bersamaan
- **Truncation output** — satu halaman HTML bisa 500 ribu karakter = membakar
  context window & dompet. Tool yang baik membatasi sendiri Outputnya
- **Umpan balik eksplisit** — tool mutasi harus **melapor** apa yang dilakukannya
  (`"OK: 120 karakter tertulis ke x.txt"`), karena model tidak melihat filesystem —
  yang dia lihat cuma string balasanmu

## File 1 — `src/tools.ts` (timpa total)

```ts
import { readdirSync, readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";

// ===== KATALOG ALAT (yang dilihat model) =====
// Deskripsi = bagian dari prompt. Tulis KAPAN memakainya, bukan cuma apa ini.
export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "read_file",
    description:
      "Baca isi sebuah file teks. Panggil setiap kali kamu membutuhkan isi file " +
      "untuk menjawab atau mengerjakan tugas — jangan pernah menebak isinya.",
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
  {
    name: "write_file",
    description:
      "Tulis atau buat file (menimpa jika sudah ada). Panggil saat user meminta " +
      "membuat/mengubah file. Sertakan SELURUH isi file di parameter content.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path file tujuan, mis. halo.txt" },
        content: { type: "string", description: "Seluruh isi file yang akan ditulis" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_files",
    description:
      "Lihat daftar nama file dan folder dalam satu folder. Panggil dulu saat kamu " +
      "tidak yakin nama file mana yang dimaksud user.",
    input_schema: {
      type: "object",
      properties: {
        dir: {
          type: "string",
          description: "Path folder relatif, mis. . atau src. Kosongkan = folder sekarang",
        },
      },
      required: [],
    },
  },
  {
    name: "web_fetch",
    description:
      "Ambil isi halaman web (HTML) sebagai teks. Panggil saat kamu butuh informasi " +
      "dari sebuah URL. Output dipotong otomatis di 5000 karakter pertama.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL lengkap, mis. https://example.com" },
      },
      required: ["url"],
    },
  },
];

// ===== EKSEKUSIOR (tangan kita) — kini ASYNC =====
// Satu try/catch untuk semua tool: kegagalan apa pun (file hilang, HTTP error,
// jaringan mati) dikembalikan sebagai STRING — bukan throw — supaya model
// membacanya dan memperbaiki diri sendiri. Agent tidak boleh crash.
export async function runTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    if (name === "read_file") {
      if (typeof input.path !== "string") {
        return "ERROR: read_file butuh parameter 'path' (string).";
      }
      return readFileSync(input.path, "utf8");
    }

    if (name === "write_file") {
      // Validasi SEBELUM menulis: String(undefined) = "undefined" —
      // tanpa gerbang ini, file sampah tercipta tanpa error sekalipun.
      if (typeof input.path !== "string" || typeof input.content !== "string") {
        return "ERROR: write_file butuh parameter 'path' dan 'content' (string).";
      }
      await Bun.write(input.path, input.content); // API native Bun
      return `OK: ${input.content.length} karakter tertulis ke ${input.path}`;
    }

    if (name === "list_files") {
      const dir = typeof input.dir === "string" ? input.dir : ".";
      return readdirSync(dir).join("\n") || "(folder kosong)";
    }

    if (name === "web_fetch") {
      if (typeof input.url !== "string") {
        return "ERROR: web_fetch butuh parameter 'url' (string).";
      }
      const res = await fetch(input.url);
      if (!res.ok) {
        return `ERROR: HTTP ${res.status} ${res.statusText} — ${input.url}`;
      }
      const body = await res.text();
      const MAX_CHARS = 5000; // lindungi context window & dompet
      return body.length > MAX_CHARS
        ? body.slice(0, MAX_CHARS) + `\n...[dipotong, total ${body.length} karakter]`
        : body;
    }

    return `ERROR: tool tidak dikenal: ${name}`;
  } catch (error) {
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}
```

## File 2 — `src/llm.ts` (ganti `SYSTEM_PROMPT` saja)

SOP ikut berkembang setiap kali kemampuan bertambah:

```ts
export const SYSTEM_PROMPT =
  "Kamu adalah agent terminal untuk tugas file lokal dan web. " +
  "Pakai tool setiap kali butuh data — jangan pernah menebak isi file atau isi halaman web. " +
  "Boleh memanggil beberapa tool sekaligus dalam satu giliran jika itu membantu. " +
  "Jawab ringkas dalam Bahasa Indonesia.";
```

## File 3 — `src/index.ts` (ganti langkah 4 — blok eksekusi tool)

Temukan blok `const result: ToolResultBlockParam[] = []` sampai `history.push({ role: "user", content: result })`, timpa dengan:

```ts
    // 4a) Kumpulkan dulu SEMUA permintaan tool pada giliran ini.
    const calls: { id: string; name: string; input: Record<string, unknown> }[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        calls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    // 4b) Eksekusi BERSAMAAN — Promise.all tidak menunggu tool A selesai
    //     sebelum mulai tool B. Log 🔧 muncul serentak di awal.
    const outputs = await Promise.all(
      calls.map(async (call) => {
        console.log(`\n🔧 ${call.name}(${JSON.stringify(call.input)})`);
        return runTool(call.name, call.input); // kini await-able
      })
    );

    // 4c) Pasangkan id ↔ hasil lewat index, jadi SATU user message.
    const result: ToolResultBlockParam[] = calls.map((call, i) => ({
      type: "tool_result",
      tool_use_id: call.id, // wajib cocok dengan id di atas
      content: outputs[i],
    }));
    history.push({ role: "user", content: result });
```

(`MAX_ITERATIONS` guard dari phase 2 tidak disentuh — sudah berfungsi.)

## Mengapa begini

- **Satu `try/catch` luar untuk semua tool** — dibanding try/catch per tool,
  satu gerbang lebih mustahil kelewat; semua kegagalan otomatis jadi "bacaan"
  untuk model
- **Validasi `typeof` ketat, bukan `String()`** — `String(undefined)` menghasilkan
  `"undefined"` tanpa error: file berhasil "ditulis" berisi sampah. Tool mutasi
  wajib menolak input yang tidak bentuknya tepat
- **`Bun.write`** — API native Bun, await-able, dan standar project ini
- **Lapor `"OK: ..."`** — model tidak punya mata; kalimat konfirmasi itulah
  satu-satunya buktinya file benar-benar tertulis
- **Kumpulkan → `Promise.all` → zip by index** — tiga langkah eksplisit supaya
  terlihat jelas mana permintaan, mana eksekusi bersamaan, mana pasangan hasil;
  dua `web_fetch` ke situs lambat kini selesai ~separuh waktu
- **Truncation 5000 karakter** — HTML satu halaman bisa ratusan ribu karakter;
  tanpa pemotong, satu `web_fetch` bisa melahap seluruh `max_tokens`-mu

## Test

Jalankan berurutan — tiap nomor menguji satu tool:

```sh
# 1. write_file (tool mutasi pertamamu!)
bun src/index.ts "Buat file halo.txt berisi satu kalimat motivasi untuk dirimu sendiri hari ini"
cat halo.txt        # verifikasi dengan mata sendiri — jangan percaya omongan model

# 2. list_files
bun src/index.ts "File apa saja yang ada di folder ini? Sebut nama file saja."

# 3. web_fetch
bun src/index.ts "Buka https://example.com, sebut judul halamannya dan jelaskan isinya"

# 4. Gabungan multi-tool (putaran panjang — perhatikan putarannya)
bun src/index.ts "List file di folder ini, baca package.json, lalu tulis ringkasan dependensinya ke ringkasan.txt"

# 5. Pancing paralel
bun src/index.ts "Baca isi package.json dan tsconfig.json sekaligus, lalu bandingkan keduanya dalam tabel singkat"
```

**Berhasil jika:** (1) `halo.txt` benar-benar berisi kalimat; (2) daftar file
muncul lewat `🔧 list_files`; (3) jawaban menyebut "Example Domain"; (4) file
`ringkasan.txt` tercipta; (5) di test 5, **dua baris `🔧 read_file` muncul
hampir bersamaan** lalu jawaban berbentuk tabel.

Bersih-bersih artefak test (pelajaran dari `catatan.txt` 😄):

```sh
rm halo.txt ringkasan.txt
```

## Eksperimen tambahan

**A. Katalog = penjara.** Hapus sementara `list_files` dari `toolDefinitions`
(jangan dari `runTool`), lalu jalankan test 2 lagi. Model TIDAK AKAN PERNAH
memanggilnya — dia hanya tahu yang ada di katalog. `runTool` yang masih punya
kodenya tidak berarti apa-apa. Kembalikan lagi setelah sadar.

**B. Validasi menyelamatkan.** Jalankan:
`bun src/index.ts "Buat file angka.txt berisi angka 123"`. Model kadang
mengirim `content: 123` (number!). Tanpa validasi → file berisi "123" benar,
tapi coba juga `"Buat file kosong.txt tanpa parameter content apa pun"` —
perhatikan ERROR dikembalikan ke model, lalu dia memperbaiki diri di putaran
berikutnya. Itulah self-correction bekerja.

**C. Truncation di depan mata.** `bun src/index.ts "Buka https://bun.com dan
katakan warna dominan halamannya"` — perhatikan `...[dipotong, total N
karakter]` di tengah jalan; model tetap bisa menjawab dari 5000 karakter pertama.

## Diagnosa umum

| Gejala | Artinya |
|---|---|
| `[object Promise]` muncul di percakapan | Lupa `await runTool(...)` — `Promise.all` meneruskan promise mentah |
| File berisi teks `"undefined"` | Validasi hilang/dilanggar — `String(undefined)` menulis sampah |
| Model tak mau pakai tool baru | Tool belum dimasukkan ke `toolDefinitions` — model cuma lihat katalog |
| Test 5 tetap serial (🔧 muncul berurutan) | Model/gateway yang memilih serial — kodemu siap paralel, tak ada yang salah |
| `ERROR: HTTP 403` di situs besar | Situs memblokir bot — bukan bug kodemu; coba situs lain |
| `maximum context length` | Output tool terlalu besar — kecilkan `MAX_CHARS` |

## Dependencies

- Phase 2: loop lengkap, `runTool`, pola kumpul-semua-hasil-ke-satu-message
- Runtime: `fetch` global (Bun bawaan), `Bun.write` (Bun bawaan) — tidak ada
  package baru yang perlu di-install
