import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources";

const model = process.env.MODEL
if (!model) {
  throw new Error("MODEL is not configured")
}

// The agent's SOP — read aloud at the start of every request.
export const SYSTEM_PROMPT =
  "You are a terminal agent for local file and web tasks. " +
  "Use a tool whenever you need data — never guess file contents or web pages. " +
  "You may call several tools in one turn when it helps. " +
  "Answer concisely.";

// Single entry point for every model call: system + tools + full history.
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
