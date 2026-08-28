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

  rl.on("close", () => process.exit(0))

  const history: MessageParam[] = []

  console.log("mini-harness REPL — /exit keluar, /reset kosongkan memori\n")

  while (true) {
    const task = await rl.question("you> ")

    if (!task.trim()) continue
    if (task === '/exit') break
    if (task === '/reset') {
      history.length = 0
      console.log("[Clearing History]")
      continue
    }

    history.push({
      role: "user",
      content: task
    })

    for (let iteration = 0; iteration < MAX_ITERATION; iteration += 1){
      const stream = ask(history, toolDefinitions)
      stream.on("text", (delta) => process.stdout.write(delta))

      const response = await stream.finalMessage()

      history.push({
        role: "assistant",
        content: response.content
      })

      if (response.stop_reason !== "tool_use") {
        console.log(`\n[Finished in ${iteration + 1} iteration(s)]`)
        break
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
          console.log(`\n 🔧 ${call.name}(${JSON.stringify(call.input)})`)
          return runTool(call.name, call.input)
        })
      )

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
  }

  console.log("Good Bye! 👋")
  rl.close()
}

main()
