import { readdirSync, readFileSync } from 'node:fs'
import type Anthropic from '@anthropic-ai/sdk'


// ===== TOOL CATALOG (what the model sees) =====
// Descriptions are part of the prompt: write WHEN to use a tool,
// not just what it is.
export const toolDefinitions: Anthropic.Tool[] = [
  // tool: read_file
  {
    name: "read_file",
    description:
      "Read the contents of a text file. Call whenever you need a file's " +
      "contents to answer or complete a task — never guess them.",
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: "File path relative to the working directory, e.g. notes.txt"
        }
      },
      required: ["path"]
    }
  },
  // tool: write_file
  {
    name: "write_file",
    description:
      "Write or create a file (overwrites if it already exists). Call when " +
      "the user asks to create or change a file. Include the ENTIRE file " +
      "content in the content parameter.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Target file path, e.g. hello.txt" },
        content: { type: "string", description: "The entire file content to write" }
      },
      required: ["path", "content"]
    }
  },
  // tool: list_files
  {
    name: "list_files",
    description:
      "List file and folder names inside a folder. Call first when you are " +
      "not sure which file the user means.",
    input_schema: {
      type: "object",
      properties: {
        dir: {
          type: "string",
          description: "Relative folder path, e.g. . or src. Omit for the current folder",
        }
      },
      required: []
    }
  },
  // tool: web_fetch
  {
    name: 'web_fetch',
    description:
      "Fetch a web page (HTML) as text. Call when you need information " +
      "from a URL. Output is truncated to the first 5000 characters.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL, e.g. https://example.com" }
      },
      required: ["url"]
    }
  }
]


// ===== EXECUTOR (our hands) — async because tools hit the network =====
// One try/catch for every tool: any failure (missing file, HTTP error,
// network down) is returned as a STRING — never thrown — so the model
// can read it and self-correct. The agent must not crash.
export async function runTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {

    // read file
    if (name === "read_file") {
      if (typeof input.path !== "string") {
        return "ERROR: read_file requires a 'path' parameter (string)."
      }
      return readFileSync(input.path, "utf8")
    }

    // write file
    if (name === "write_file") {
      // Validate BEFORE writing: String(undefined) === "undefined" —
      // without this gate, garbage files appear without a single error.
      if (typeof input.path !== "string" || typeof input.content !== "string") {
        return "ERROR: write_file requires 'path' and 'content' parameters (string)."
      }
      await Bun.write(input.path, input.content)
      return `OK: wrote ${input.content.length} characters to ${input.path}`
    }

    // list files
    if (name === "list_files") {
      const dir = typeof input.dir === "string" ? input.dir : "."
      return readdirSync(dir).join("\n") || "(empty folder)"
    }

    // web fetch
    if (name === "web_fetch") {
      if (typeof input.url !== "string") {
        return "ERROR: web_fetch requires a 'url' parameter (string)."
      }

      const res = await fetch(input.url)
      if (!res.ok) {
        return `ERROR: HTTP ${res.status} ${res.statusText} - ${input.url}`
      }

      const body = await res.text()
      const MAX_CHARS = 5000 // protect the context window and your wallet
      return body.length > MAX_CHARS
        ? body.slice(0, MAX_CHARS) + `\n...[truncated, total ${body.length} characters]`
        : body
    }

    return `ERROR: unknown tool: ${name}`
  } catch (error) {
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`
  }
}
