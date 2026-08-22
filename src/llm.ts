import Anthropic from "@anthropic-ai/sdk";

export const client = new Anthropic()

const model = process.env.MODEL
if (!model) {
  throw new Error("MODEL uncofigured")
}

export const MODEL = model
