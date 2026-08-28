import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources";

const model = process.env.MODEL
if (!model) {
  throw new Error("MODEL uncofigured")
}

// system prompt
export const SYSTEM_PROMPT =
  "Kamu adalah agent terminal untuk tugas file lokal dan web. " +
  "Pakai tool setiap kali butuh data — jangan pernah menebak isi file atau isi halaman web. " +
  "Boleh memanggil beberapa tool sekaligus dalam satu giliran jika itu membantu. " +
  "Jawab ringkas dalam Bahasa Indonesia.";

// ask
export function ask(history: MessageParam[], tools: Tool[]) {
  return client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools,
    messages: history
  })
}

export const client = new Anthropic()
export const MODEL = model
