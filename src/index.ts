import { client, MODEL } from "./llm";

async function main() {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      { role: 'user', content: 'whos current president of indonesia?'}
    ]
  })

  for (const block of response.content) {
    if (block.type === 'text') {
      process.stdout.write(block.text)
    }
  }

  console.log({
    model: response.model,
    stop_reason: response.stop_reason,
    token_in_out: `${response.usage.input_tokens}/${response.usage.output_tokens}`
  })
}

main()
