import { ask } from "./llm";
import { toolDefinitions, runTool } from "./tools";
import type { MessageParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources";


const MAX_ITERATION = 10

async function main() {
  const task = process.argv[2]
  if (!task) {
    console.error('Error running task')
    process.exit(1)
  }

  const history: MessageParam[] = [{
    role: 'user',
    content: task
  }]

  for (let iteration = 0; iteration < MAX_ITERATION; iteration += 1){
    const stream = ask(history, toolDefinitions)
    stream.on('text', (delta) => process.stdout.write(delta))

    const response = await stream.finalMessage()

    history.push({
      role: "assistant",
      content: response.content
    })

    // for (const block of response.content) {
    //   if (block.type === 'text') {
    //     process.stdout.write(block.text + "\n")
    //   }
    // }

    if (response.stop_reason !== 'tool_use') {
      console.log(`\n[selesai dalam ${iteration + 1} putaran]`)
      return;
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
  console.error("Limit loop has reachead.")
}

main()
