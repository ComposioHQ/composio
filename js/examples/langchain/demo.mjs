import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { pull } from "langchain/hub";
import { LangchainToolSet } from "composio-core";

async function main() {
    try {
        const body = "TITLE: HELLO WORLD, DESCRIPTION: HELLO WORLD for the repo - utkarsh-dixit/speedy";

        const llm = new ChatOpenAI({
            model: "gpt-4",
        });

        const toolset = new LangchainToolSet({
            apiKey: process.env.COMPOSIO_API_KEY,
        });

        const tools = await toolset.get_actions("github_issues_create");

        const prompt = await pull(
            "hwchase17/openai-functions-agent"
        );

        const agent = await createOpenAIFunctionsAgent({
            llm,
            tools,
            prompt,
        });

        const agentExecutor = new AgentExecutor({
            agent,
            tools,
            verbose: true,
        });

        const result = await agentExecutor.invoke({
            input: "Please create another github issue with the summary and description with the following details of another issue:- , " + JSON.stringify(body)
        });

        console.log({ output: result.output });
    } catch (error) {
        console.error(error);
    }
}

main();
