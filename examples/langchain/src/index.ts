import { Composio } from "@composio/core"
import { LangchainToolset } from "@composio/langchain-toolset"
import process from "process"

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
})

const toolset = new LangchainToolset()
toolset.setClient(composio)

const tools = await toolset.getTools()

console.log(tools)