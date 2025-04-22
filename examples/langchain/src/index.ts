import { Composio } from "@composio/core"
import { LangchainToolset } from "@composio/langchain"
import process from "process"

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new LangchainToolset()
})

// direct tool access
const tools = await composio.getTools()

console.log(tools)