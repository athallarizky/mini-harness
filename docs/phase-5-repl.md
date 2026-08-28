# Phase 5 — REPL Interaktif (Phase Penutup)

## Goal

Mengubah harness one-shot jadi **percakapan multi-turn**: `bun src/index.ts`
tanpa argumen → prompt `kamu>` menunggu → tugas dikerjakan (streaming + tools,
semua yang sudah kamu punya) → prompt muncul lagi — dan model **masih ingat**
giliran sebelumnya.

Fase ini menutup lingkaran tema project: *"memori = ilusi array history"*.
Di phase 2 kamu buktikan **antar-process** memori hilang. Sekarang kamu buktikan
**antar-giliran dalam satu process** memori bertahan — semata-mata karena array
itu hidup terus. Satu perintah `/reset` akan membuatnya amnesia seketika.

## Konsep baru

- **REPL** (Read-Eval-Print-Loop) — pola loop tertua di komputasi (Lisp,
  tahun 1960-an). Harness-mu kini **loop bersarang**: REPL di luar (irama
  manusia) + agent loop di dalam (irama model). Claude Code? Persis ini
- **State lintas giliran** — `history` pindah keluar: dari "lahir-mati dalam
  satu tugas" menjadi "hidup sepanjang process". Ini SATU-SATUNYA perubahan
  struktural fase ini
- **`return` vs `break`** — jebakan utama fase ini. `return` membunuh seluruh
  `main()` = REPL mati setelah jawaban pertama. `break` cuma keluar dari agent
  loop = kembali ke prompt, history selamat
- **Mutasi in-place** — mengosongkan array const: `history.length = 0`, bukan
  `history = []` (yang terakhir ilegal untuk `const` — dan reassign memutus
  referensi closure)
- **`node:readline/promises`** — API bawaan Node yang jalan di Bun
  (terverifikasi): `await rl.question()` = input sinkron yang tidak
  menyumbat alur berpikirmu

## File 1 — `src/index.ts` (timpa total — ini perombakan terbesar sejak phase 2)

```ts
import { ask } from "./llm";
import { toolDefinitions, runTool } from "./tools";
import readline from "node:readline/promises";
import type { MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources";

const MAX_ITERATION = 10

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  // Ctrl+D (EOF) menutup interface — pastikan process ikut mati, bukan menggantung
  rl.on("close", () => process.exit(0))

  // ⭐ INTI FASE INI: history hidup SEBELUM loop user — satu array untuk
  //    SELURUH sesi. Setiap giliran user tinggal menumpuk ke sini.
  const history: MessageParam[] = []

  console.log("mini-harness REPL — /exit keluar, /reset kosongkan memori\n")

  // ===== LOOP LUAR: REPL (satu putaran = satu giliran user) =====
  while (true) {
    const task = await rl.question("kamu> ")

    if (!task.trim()) continue
    if (task === "/exit") break
    if (task === "/reset") {
      history.length = 0   // kosongkan IN-PLACE: const tak bisa di-reassign
      console.log("[history dikosongkan — model kembali amnesia]\n")
      continue
    }

    // siapa yang menulis memori: user turn masuk ke array SESI, bukan array tugas
    history.push({ role: "user", content: task })

    // ===== LOOP DALAM: agent loop — PERSIS PHASE 4, satu-satunya ubah: return → break =====
    for (let iteration = 0; iteration < MAX_ITERATION; iteration += 1) {
      const stream = ask(history, toolDefinitions)
      stream.on('text', (delta) => process.stdout.write(delta))

      const response = await stream.finalMessage()

      history.push({
        role: "assistant",
        content: response.content
      })

      if (response.stop_reason !== 'tool_use') {
        console.log(`\n[selesai dalam ${iteration + 1} putaran]\n`)
        break        // ← BUKAN return! keluar agent-loop, kembali ke prompt
      }

      // tools execution
      const calls: { id: string; name: string; input: Record<string, unknown> }[] = []
      for (const block of response.content) {
        if (block.type === "tool_use") {
          calls.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>
          })
        }
      }

      // tools pararel execution
      const output = await Promise.all(
        calls.map(async (call) => {
          console.log(`\n🔧 ${call.name}(${JSON.stringify(call.input)})`);
          return runTool(call.name, call.input)
        })
      )

      const result: ToolResultBlockParam[] = calls.map((call, i) => ({
        type: "tool_result",
        tool_use_id: call.id,
        content: output[i]
      }))

      history.push({
        role: 'user',
        content: result
      })
    }
  }

  console.log("sampai jumpa! 👋")
  rl.close()
}

main()
```

`src/llm.ts` dan `src/tools.ts` tidak disentuh sama sekali.

## Mengapa begini

- **Satu perubahan struktural, semuanya mengikuti** — `history` pindah keluar
  loop. Itu saja. Tidak ada mekanisme memori baru, tidak ada "sesi" khusus:
  mengingat = array masih ada; lupa = array dikosongkan. Sesederhana itu,
  dan memang sesederhana itu juga di agent sungguhan
- **`break` menggantikan `return`** — ruang lingkup keluar berbeda: `return`
  menembus semua loop sampai keluar fungsi; `break` cuma satu lapis. Salah
  pilih = REPL mati setelah jawaban pertama (lihat tabel diagnose)
- **`history.length = 0`** — trik mutasi in-place: array `const` tidak bisa
  di-reassign, tapi isinya boleh dimodifikasi. `length = 0` adalah cara
  idiomatik mengosongkan tanpa membuat array baru
- **`rl.question` di-sync-kan** — tanpa `await`, pertanyaan dan lanjutnya
  kode berdesakan; dengan `await`, alur REPL terbaca seperti cerita:
  tanya → kerjakan → ulangi

## Test — experiment uangnya langsung di sini

```sh
bun src/index.ts
```

Lalu jalankan skenario ini **berurutan dalam satu sesi**:

```
kamu> Baca package.json dan ingat dependensinya apa saja

        (🔧 read_file muncul, jawaban mengalir)

kamu> Sekarang sebut lagi dependensinya — tanpa membaca ulang

        (TIDAK ada 🔧! model menjawab dari history — ini "ingat"-nya)

kamu> /reset

[history dikosongkan — model kembali amnesia]

kamu> Sebut dependensinya

        (🔧 MUNCUL LAGI — dia tidak ingat apa-apa, membaca ulang dari nol)

kamu> /exit
sampai jumpa! 👋
```

**Berhasil jika:** giliran 2 dijawab **tanpa** 🔧 (bukti memori lintas giliran),
dan giliran setelah `/reset` menjawab **dengan** 🔧 (bukti memori itu cuma
array — kosongkan array, amnesia instan).

## Eksperimen tambahan

**A. Uji mutasi file lintas giliran.**
```
kamu> Buat file catatan-repl.txt berisi satu baris: "baris pertama"
kamu> Tambahkan baris kedua: "baris kedua"
```
Perhatikan: `write_file`-mu MENIMPA, bukan menambah. Model yang pintar akan
`read_file` dulu lalu `write_file` dengan gabungan dua baris. Cek hasilnya
dengan `cat catatan-repl.txt` — dua baris, atau satu? Itu latihan nyata
"model + tool mutasi + memori" bekerja sama.

**B. Bandingkan dengan phase 2.** Dulu: dua process berurutan = tidak ingat.
Sekarang: satu process, dua giliran = ingat. Apa yang berubah? Bukan modelnya,
bukan API-nya — cuma **umur array**. Kalau besok kamu menambahkan "simpan
history ke file saat exit, muat saat start", kamu baru menemui konsep
*session file* — format yang kamu riset di repo research-ai-agents-mu.

**C. Lihat context yang membengkak.** Ngobrol panjang (5-6 giliran), lalu
amati: tiap giliran mengirim ulang SELURUH history. Belum ada mekanisme
pemangkasan di harness-mu — di sinilah "context engineering" mulai relevan
di dunia nyata (compaction, truncation, summarization).

## Diagnosa umum

| Gejala | Artinya |
|---|---|
| REPL keluar setelah jawaban pertama | Masih `return` — ganti `break` di akhir agent loop |
| Model tidak ingat giliran sebelumnya | `history` masih dideklarasi di dalam loop user |
| `Assignment to constant variable` saat /reset | Pakai `history = []`; yang benar `history.length = 0` |
| Prompt tidak pernah muncul | Lupa `await rl.question(...)`, atau interface tak dapat stdin |
| Proses menggantung saat Ctrl+D | Event `close` belum menangani `process.exit(0)` |
| `bun src/index.ts "tugas"` diabaikan | Memang — fase ini tidak lagi membaca `argv[2]`; semuanya lewat prompt |

## Dependencies

- Phase 4: agent loop streaming utuh — fase ini HANYA membungkusnya dalam
  REPL loop; tidak ada logika baru di dalamnya
- API: `node:readline/promises` (bawaan Node, terverifikasi jalan di Bun 1.3)

## Penutup — apa yang baru kamu bangun

Lima phase, lima commit, dan di tanganmu sekarang: **agent harness utuh** —
konektor SDK, agent loop, empat tools paralel, streaming SSE, dan REPL
multi-turn. Bandingkan dengan arsitektur yang kita bedah di Nakama dulu:
kerangkanya sama, dan kamu menulis setiap barisnya sendiri.

Kalau suatu saat kamu membongkar Claude Code atau Pi lagi, yang akan kamu
lihat hanyalah fase-fase ini — plus segala hal yang sengaja kita tinggalkan
di luar cakupan: permission system, context compaction, sub-agent, MCP,
session persistence. Semuanya kini punya tempat yang jelas di peta mentalmu.
