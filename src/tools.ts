import { readdirSync, readFileSync } from 'node:fs'
import type Anthropic from '@anthropic-ai/sdk'


export const toolDefinitions: Anthropic.Tool[] = [
  // tool: read_file
  {
    name: "read_file",
    description:
    "Baca isi sebuah file teks. Panggil setiap kali kamu membutuhkan isi file " +
    "untuk menjawab atau mengerjakan tugas — jangan pernah menebak isinya.",
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:  "Path file relatif terhadap folder jalanannya, mis. catatan.txt"
        }
      },
      required: ["path"]
    }
  },
  // tool: write_file
  {
    name: "write_file",
    description:
      "Tulis atau buat file (menimpa jika sudah ada). Panggil saat user meminta " +
      "membuat/mengubah file. Sertakan SELURUH isi file di parameter content.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path file tujuan, mis. halo.txt" },
        content: { type: "string", description: "Seluruh isi file yang akan ditulis" }
      },
      required: ["path", "content"]
    }
  },
  // tools: list_files
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
        }
      },
      required: []
    }
  },
  // tools: web_fetch
  {
    name: 'web_fetch',
    description:
      "Ambil isi halaman web (HTML) sebagai teks. Panggil saat kamu butuh informasi " +
      "dari sebuah URL. Output dipotong otomatis di 5000 karakter pertama.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL lengkap, mis. https://example.com" }
      },
      required: ["url"]
    }
  }
]


export async function runTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {

    // read file
    if (name === "read_file") {
      if (typeof input.path !== "string") {
        return "ERROR: read_file butuh parameter 'path' (string)."
      }
      return readFileSync(input.path, "utf8")
    }

    // write file
    if (name === "write_file") {
      if (typeof input.path !== "string" || typeof input.content !== "string") {
        return `ERROR: write_file butuh parameter 'path' dan 'content' (string).`
      }
      await Bun.write(input.path, input.content)
      return `OK: ${input.content.length} karakter tertulis ke ${input.path}.`
    }

    // list file
    if (name === "list_files") {
      const dir = typeof input.dir === "string" ? input.dir : "."
      return readdirSync(dir).join("\n") || "(folder kosong)"
    }

    // web fetch
    if (name === "web_fetch") {
      if (typeof input.url !== "string") {
        return `ERROR: web_fetch butuh parameter 'url' (string).`
      }

      const res = await fetch(input.url)
      if (!res.ok) {
        return `ERROR: HTTP ${res.status} ${res.statusText} - ${input.url}`
      }

      const body = await res.text()
      const MAX_CHARS = 5000;
      return body.length > MAX_CHARS
        ? body.slice(0, MAX_CHARS) + `\n...[dipotong, total ${body.length}] karakter]`
        : body
    }

    return `Error: tools not found: ${name}`
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`
  }
}
