import { readFileSync } from 'node:fs'
import type Anthropic from '@anthropic-ai/sdk'


export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "read_file",
    description:
      "Baca isi sebuah file teks. Panggil saat kamu membutuhkan isi file " +
      "untuk menjawab atau mengerjakan tugas.",
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path file to active folder'
        }
      },
      required: ["path"]
    }
  }
]


export function runTool(name: string, input: Record<string, unknown>): string {
  if (name === 'read_file') {
    const path = String(input.path)

    try {
      return readFileSync(path, 'utf-8')
    } catch (error) {
      return `Error: ${error instanceof Error ? error : String(error)}`
    }
  }

  return `Error: tools not found: ${name}`
}
