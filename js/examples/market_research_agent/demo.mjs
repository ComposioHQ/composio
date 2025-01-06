import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { pull } from "langchain/hub";
import dotenv from 'dotenv';
import { LangchainToolSet } from "composio-core";

dotenv.config();


(async () => {
    try {
        const llm = new ChatOpenAI({
            model: "gpt-4-turbo",
            apiKey: process.env.OPENAI_API_KEY,
        });

        const toolset = new LangchainToolSet({
            apiKey: process.env.COMPOSIO_API_KEY,
        });

        const tools = await toolset.getTools({
            apps: ["tavily","googledocs"]
        });

        const prompt = await pull("hwchase17/openai-functions-agent");

        // Debugging logs
        //console.log("LLM:", llm);
        console.log("Tools:", tools);
        //console.log("Prompt:", prompt);

        const additional = `
        You are a market research agent that finds niche ideas that can be built and marketed. 
        Your users are primarily indie hackers who want to build something new and are looking for ideas. The input will 
        be a domain or a category and your job is to research extensively and find ideas that can be marketed.
        Write this content in a google doc, create a google doc before writing in it.
        I want you to show the following content:
        - Data Collection and Aggregation - Show data supporting a trend
        - Sentiment Analysis - Show customer sentiment on the topic
        - Trend Forecasting
        - Competitor Analysis
        - Competitor Benchmarking
        - Idea Validation`;

        // Check combined_prompt

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
        const domain = 'AI SaaS'
        const result = await agentExecutor.invoke({
            input: additional + 'This is the domain:' + domain
        });
        console.log('🎉Output from agent: ', result.output);
        return result.output
    } catch (error) {
        console.error(error);
    }
})();
