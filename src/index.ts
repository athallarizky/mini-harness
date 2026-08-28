import { ask } from "./llm";
import { toolDefinitions, runTool } from "./tools";
import readline from "node:readline/promises"
import type { MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources";


const MAX_ITERATION = 10

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  // Ctrl+D (EOF) closes the interface — make sure the process exits too
  rl.on("close", () => process.exit(0))

  // Session memory: ONE array for the WHOLE session. Every user turn and
  // every model reply piles up here. Wipe it and the agent forgets everything.
  const history: MessageParam[] = []

  console.log("mini-harness REPL — /exit to quit, /reset to clear memory\n")

  // ===== OUTER LOOP: the REPL (one round = one user turn) =====
  while (true) {
    const task = await rl.question("you> ")

    if (!task.trim()) continue
    if (task === "/exit") break
    if (task === "/reset") {
      history.length = 0
      console.log("[history cleared]\n")
      continue
    }

    history.push({
      role: "user",
      content: task
    })

    // ===== INNER LOOP: the agent loop — streaming + tools =====
    let finished = false
    for (let iteration = 0; iteration < MAX_ITERATION; iteration += 1) {
      const stream = ask(history, toolDefinitions)
      stream.on("text", (delta) => process.stdout.write(delta))

      const response = await stream.finalMessage()

      // Push the model's reply as-is — tool_use blocks must stay in history
      history.push({
        role: "assistant",
        content: response.content
      })

      if (response.stop_reason !== "tool_use") {
        console.log(`\n[finished in ${iteration + 1} round(s)]\n`)
        finished = true
        break
      }

      // Collect every tool request from this turn
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

      // Execute all tool calls concurrently
      const output = await Promise.all(
        calls.map(async (call) => {
          console.log(`\n 🔧 ${call.name}(${JSON.stringify(call.input)})`)
          return runTool(call.name, call.input)
        })
      )

      // Pair each call with its result by index — ONE user message
      const result: ToolResultBlockParam[] = calls.map((call, i) => ({
        type: "tool_result",
        tool_use_id: call.id,
        content: output[i]
      }))

      history.push({
        role: "user",
        content: result
      })
    }

    if (!finished) {
      console.error("Max iterations reached — stopping to protect your wallet.")
    }
  }

  console.log("Goodbye! 👋")
  rl.close()
}

main()
