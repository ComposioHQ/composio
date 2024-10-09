import dotenv from 'dotenv';
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { pull } from "langchain/hub";
import { LangchainToolSet } from "composio-core";
import readline from 'readline';

dotenv.config();
// Access environment variables
const openaiapiKey = process.env.OPENAI_API_KEY;
const composioapiKey = process.env.COMPOSIO_API_KEY;

// Use environment variables in your code
// ...

// Initialize the language model
const llm = new ChatOpenAI({ model: "gpt-4-turbo", apiKey: openaiapiKey});

// Define tools for the agents
const composioToolset = new LangchainToolSet({
    apiKey: composioapiKey
});

//Sample input code, change according to code you want to debug
const input = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Untitled Document</title>
</head>
<body>
  <button type="button" onClick="myfunc()"></button>
  <script>
    function myfunc() {
      var a = prompt("Enter the year?");
      if (a % 4 == 0) {
        if (a % 100 == 0) {
          if (a % 400 == 0) {
            window.alert("it is a leap year");
          }
          else:
            window.alert("it is not a leap year");
        }
        else:
          window.alert("it is a leap year");
      }
    }
  </script>
</body>
</html>

`;


// Setup Todo
const todo = `
  This is the code given to you ${input}.
  Execute it and find all the errors and bugs within it, then find solutions for these
  either by trying various modifications or going on internet. Suggest links that can be 
  read up on if you cant find a concrete solution.  
`;

async function runAgent() {
    const tools = await composioToolset.getTools({
        apps:['codeinterpreter','exa','tavily']
    });

    const prompt = await pull("hwchase17/openai-functions-agent");
    const agent = await createOpenAIFunctionsAgent({
        llm,
        tools,
        prompt
    });

    const agentExecutor = new AgentExecutor({
        agent,
        tools,
        verbose: true,
    });

    const result = await agentExecutor.invoke({
        input: todo
    });

    console.log(result.output);
    return "Agent execution completed";
}

runAgent().then(console.log).catch(console.error);
