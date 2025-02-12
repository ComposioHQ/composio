import { openai } from "@ai-sdk/openai";
import { VercelAIToolSet } from "composio-core";
import dotenv from "dotenv";
import { generateText } from "ai";
import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import ora from 'ora';
import {createInterface} from 'readline'

dotenv.config();

const displayLogo = () => {
  console.clear();
  console.log('\n');
  console.log(gradient.retro.multiline(figlet.textSync('COMPOSIO', {
    font: 'ANSI Shadow',
    horizontalLayout: 'fitted'
  })));
  console.log(gradient.retro.multiline(figlet.textSync('DEEP RESEARCHER', {
    font: 'Small',
    horizontalLayout: 'fitted'
  })));
  console.log('\n');
}

const displayFrame = (text) => {
  const width = process.stdout.columns;
  const horizontalBorder = '='.repeat(width);
  console.log(chalk.cyan(horizontalBorder));
  console.log(chalk.yellow(text));
  console.log(chalk.cyan(horizontalBorder));
}

const displayLoadingAnimation = (text) => {
  return ora({
    text: chalk.blue(text),
    spinner: {
      frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    },
    color: 'yellow'
  });
}

// Setup toolset
const toolset = new VercelAIToolSet({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const appName = "serpapi";

async function setupUserConnectionIfNotExists(entityId) {
  const spinner = displayLoadingAnimation('Checking connection status...');
  spinner.start();
  
  try {
    const entity = await toolset.client.getEntity(entityId);
    const connection = await entity.getConnection({app:appName});

    if (!connection) {
      spinner.text = 'Initiating new connection...';
      const newConnection = await entity.initiateConnection(appName);
      console.log(chalk.green("\n🔗 Log in via: "), chalk.blue.underline(newConnection.redirectUrl));
      spinner.text = 'Waiting for connection...';
      return await newConnection.waitUntilActive(60);
    }

    spinner.succeed(chalk.green('Connection established!'));
    return connection;
  } catch (error) {
    spinner.fail(chalk.red('Connection failed!'));
    throw error;
  }
}

async function executeAgent(entityName) {
  displayLogo();
  
  displayFrame('Initializing Deep Research Protocol...');
  
  // Setup entity and ensure connection
  const entity = await toolset.client.getEntity(entityName);
  await setupUserConnectionIfNotExists(entity.id);

  const spinner = displayLoadingAnimation('Retrieving tools...');
  spinner.start();

  // Retrieve tools for the specified app
  const tools = await toolset.getTools({ 
    apps: ["serpapi", "tavily"] 
  }, entity.id);
  
  spinner.succeed(chalk.green('Tools retrieved successfully!'));

  displayFrame('Initiating Deep Search Sequence...');
  
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  displayFrame('Enter Research Topic');
  
  const topic = await new Promise((resolve) => {
    console.log('\n' + chalk.yellow('What do you want to research on? '));
    readline.question('', (answer) => {
      readline.close();
      resolve(answer);
    });
  });

  const searchSpinner = displayLoadingAnimation('Analyzing data patterns...');
  searchSpinner.start();

  try {
    // First research call with broader perspective
    const output = await generateText({
      model: openai("gpt-4o"),
      streamText: false,
      tools: tools,
      prompt: `
You are an advanced Deep Research Agent. Your task is to thoroughly research ${topic} from multiple perspectives:

1. Technical/Scientific Perspective
- Core concepts and technical details
- Latest developments and innovations
- Technical specifications and capabilities

2. Business/Market Perspective  
- Market applications and use cases
- Industry impact and adoption
- Key companies and competitors

3. Social/Cultural Impact
- Effect on users/society
- Potential benefits and concerns
- Future implications

4. Historical Context
- Origin and evolution
- Key milestones and developments
- Notable contributors

Conduct comprehensive research covering these perspectives. Focus on finding factual, verifiable information from credible sources, cite your sources.
`,
      maxToolRoundtrips: 5,
    });

    // Second call to summarize and structure the findings
    const summary = await generateText({
      model: openai("o1"),
      system: `You are an expert research synthesizer. Give a deep insight into the research conducted. Your task is to:
1. Analyze the raw research data
2. Extract key insights and findings
3. Organize information into clear sections
4. Present a well-structured, easy-to-read summary
5. Highlight key takeaways and implications`,
      prompt: `Analyze and synthesize the following research data:\n${output.text}\n\nTool results:\n${JSON.stringify(output.toolResults, null, 2)}`
    });
    
    searchSpinner.succeed(chalk.green('Research completed successfully!'));
    
    // Display formatted results
    displayFrame('Research Findings');
    console.log('\n' + chalk.cyan('🔍 COMPREHENSIVE ANALYSIS\n'));
    console.log(chalk.yellow(summary.text || summary));
    
    // Display key highlights
    displayFrame('Key Takeaways');
    const highlights = await generateText({
      model: openai("gpt-4o"),
      system: "Extract 3-5 key takeaways from the research summary. Be concise and insightful.",
      prompt: summary.text || summary
    });
    console.log('\n' + chalk.green(highlights.text || highlights));
    
    displayFrame('Mission Accomplished');
  } catch (error) {
    searchSpinner.fail(chalk.red('Research failed!'));
    throw error;
  }
}

executeAgent("default").catch(error => {
  console.error(chalk.red('\n❌ Error occurred:', error));
  process.exit(1);
});