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
    const response = await ask(history, toolDefinitions)

    history.push({
      role: "assistant",
      content: response.content
    })

    for (const block of response.content) {
      if (block.type === 'text') {
        process.stdout.write(block.text + "\n")
      }
    }

    if (response.stop_reason !== 'tool_use') {
      console.log(`\n[selesai dalam ${iteration + 1} putaran]`)
      return;
    }

    const result: ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type === 'tool_use') {

        console.log(`\n🔧 ${block.name}(${JSON.stringify(block.input)}) `)

        const output = runTool(block.name, block.input as Record<string, unknown>)
        result.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: output
        })
      }
    }

    history.push({
      role: 'user',
      content: result
    })
  }
  console.error("Limit loop has reachead.")
}

main()
