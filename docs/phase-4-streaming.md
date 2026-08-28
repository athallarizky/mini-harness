# Phase 4 — Streaming

## Goal

Mengubah cara harness menerima balasan: dari "diam beberapa detik lalu teks
muncul serentak" menjadi **teks mengalir per potongan saat model masih
menulisnya** — pengalaman ala Claude Code sungguhan.

Fase ini juga membuktikan janji desain di phase 2: *"ask() terpusat di llm.ts —
saat fase streaming nanti, cuma satu fungsi yang perlu diubah dari `create`
ke `stream`."* Loop utamamu hampir tidak tersentuh.

## Konsep baru

- **SSE (Server-Sent Events)** — balasan dikirim server sebagai deretan event
  bernama lewat HTTP chunked; satu arah (beda dengan WebSocket yang dua arah)
- **Siklus hidup event** — satu balasan = rangkaian event:
  ```
  message_start
    → content_block_start        (blok teks dimulai)
    → content_block_delta  ×N    (text_delta: potongan teks)
    → content_block_stop
    → content_block_start        (blok tool_use dimulai)
    → content_block_delta  ×N    (input_json_delta: POTONGAN JSON argumen!)
    → content_block_stop
    → message_delta              (di sinilah stop_reason tiba)
  message_stop
  ```
- **Delta & buffer** — server hanya mengirim pecahan; seseorang harus merakit
  ulang jadi pesan utuh. `finalMessage()` melakukannya untukmu
- **Handle vs Promise** — `create()` mengembalikan Promise (satu nilai di masa
  depan); `stream()` langsung mengembalikan *handle* (object yang memancarkan
  event). `await` hanya dipakai di `finalMessage()`
- **Tool input ikut stream** — argumen tool (`{"path":"package.json"}`) juga
  tiba char demi char sebagai `input_json_delta` — model benar-benar "mengetik"
  JSON-nya, bukan mengirim jadi-jadian

## File 1 — `src/llm.ts` (ganti isi `ask()` saja)

```ts
// ask — kini streaming: mengembalikan handle, bukan Promise pesan jadi
export function ask(history: MessageParam[], tools: Tool[]) {
  return client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools,
    messages: history
  })
}
```

## File 2 — `src/index.ts` (3 tambahan + 1 penghapusan)

Di dalam `for` loop, ubah awal putaran:

```ts
    // 1) MINTA stream — TANPA await: stream() langsung mengembalikan handle,
    //    request sudah terbang ke server di baris ini
    const stream = ask(history, toolDefinitions)

    // 2) Pasang printer delta SEGERA — sebelum menunggu apa pun,
    //    supaya tidak ada potongan yang lolos
    stream.on('text', (delta) => process.stdout.write(delta))

    // 3) Tunggu pesan utuh terkumpul — bentuknya PERSIS response phase 3
    const response = await stream.finalMessage()
```

**HAPUS** blok cetak teks lama ini (delta printer menggantikannya — kalau
dibiarkan, semua teks tercetak dua kali):

```ts
    // HAPUS:
    for (const block of response.content) {
      if (block.type === 'text') {
        process.stdout.write(block.text + "\n")
      }
    }
```

**Sisanya jangan disentuh** — dari `history.push({ role: "assistant", ... })`
sampai akhir loop, semua persis phase 3: `response.content` tetap array block
utuh, `response.stop_reason` tetap ada, `calls`/`Promise.all`/zip tetap bekerja.

## Mengapa begini

- **Dua dunia dalam satu stream** — `on('text')` mencetak langsung (event-driven),
  `finalMessage()` menunggu sampai tuntas (imperatif). Kamu baru saja mencampur
  dua gaya pemrograman dalam 3 baris — dan itu idiomatik
- **`finalMessage()` = buffer gratis** — tanpa helper ini, kamu harus merakit
  sendiri: menampung `text_delta` jadi string, `input_json_delta` jadi JSON,
  lalu menyusun block. SDK sudah melakukannya; bentuk akhirnya identik dengan
  hasil `create()` — makanya loop-mu tak perlu berubah
- **Perubahan minimal = desain phase 2 membuahkan hasil** — karena semua
  panggilan model lewat satu pintu `ask()`, migrasi streaming cuma menyentuh
  satu fungsi. Kalau `create()` tersebar di 5 tempat, kamu akan mengedit 5 tempat
- **Streaming mengubah CARA menerima, bukan APA yang dilakukan** — loop,
  tool_result, history: logika bisnisnya sama; hanya pipa pengirimannya yang diganti

## Test

```sh
# 1. Lihat teks MENGALIR — baris demi baris muncul saat model masih menulis
bun src/index.ts "Tulis puisi 8 baris tentang while loop yang akhirnya menemui break"

# 2. Pastikan jalur tool tidak rusak
bun src/index.ts "Baca package.json dan sebut dependensinya satu per satu"

# 3. Putaran panjang: narasi, tool, narasi lagi — semua hidup
bun src/index.ts "List file di sini, baca README.md, lalu tulis puisi 4 baris tentang isinya"
```

**Berhasil jika:** (1) kata-kata muncul bertahap, bukan serentak setelah diam
beberapa detik; (2) narasi mengalir dulu, lalu `🔧 read_file(...)` muncul,
putaran kedua jalan, `[selesai dalam 2 putaran]`; (3) tidak ada teks dobel.

## Eksperimen tambahan

**A. Intip protokol mentah.** Bikin file sementara `src/lihat-event.ts`
(hapus setelah selesai) — ini membuka semua abstraksi:

```ts
import { client, MODEL } from "./llm"

const stream = await client.messages.create({
  model: MODEL,
  max_tokens: 512,
  messages: [{ role: "user", content: "Sebut dua kota, lalu baca file README.md" }],
  tools: [{                      // katalog versi ringkas, cukup untuk eksperimen
    name: "read_file",
    description: "Baca file",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  }],
  stream: true,
})

for await (const event of stream) {
  console.log(event.type.padEnd(22), JSON.stringify(event).slice(0, 120))
}
```

Perhatikan `text_delta` pecahan-pecahan, lalu saat model memutuskan memanggil
tool: deretan `input_json_delta` berisi JSON TERPOTONG seperti `{"pa` → `th":`
→ `"README.md"}`. Itu bukti model "mengetik" argumennya.

**B. Rasakan bedanya waktu-tunggu.** Jalankan test 1, lalu ingat-ingat phase 3:
dulu kamu menatap layar kosong ~5-10 detik sebelum SEMUA teks muncul. Sekarang
kata pertama tiba dalam hitungan ratusan milidetik. Total waktu selesai hampir
sama — yang berubah adalah **waktu-tunggu-yang-terasa** (perceived latency).
Itu seluruh alasan streaming ada: manusia membenci diam.

**C. (Opsional) `stop_reason` datang belakangan.** Dari eksperimen A, perhatikan
`message_delta` di ujung — di situlah `stop_reason` dibawa. Artinya: sebelum
event itu tiba, TIDAK ADA yang tahu model akan minta tool atau bilang selesai.
Loop-mu selama ini memang harus menunggu pesan utuh.

## Diagnosa umum

| Gejala | Artinya |
|---|---|
| Teks tercetak dua kali | Blok cetak lama belum dihapus |
| Tidak ada teks sama sekali | `.on('text')` lupa dipasang, atau terpasang setelah menunggu |
| `response.content is undefined` / crash | `ask()` dipakai seperti Promise — lupa `await stream.finalMessage()`; handle bukan hasil |
| `stop_reason` undefined | Membaca response sebelum `finalMessage()` selesai |
| Event `error` / koneksi putus | Gateway/Z.ai bermasalah — cek `.env`, coba lagi; bisa dipasang `stream.on('error', ...)` |

## Dependencies

- Phase 3: loop + empat tools + pola response (`content` + `stop_reason`) yang
  bentuknya identik dengan hasil `finalMessage()`
- API: `client.messages.stream()` + `.on('text')` + `.finalMessage()` —
  sudah ada di `@anthropic-ai/sdk` 0.120.0 yang ter-install (terverifikasi
  di `node_modules/@anthropic-ai/sdk/lib/MessageStream.d.ts`)
