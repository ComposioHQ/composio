import express from 'express';
import { ChatOpenAI } from "@langchain/openai";
import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { pull } from "langchain/hub";
import dotenv from 'dotenv';
import { LangchainToolSet } from "composio-core";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 2001;

app.use(express.json());

async function createAgentExecutor(llm, tools, prompt) {
    const agent = await createOpenAIFunctionsAgent({
        llm,
        tools,
        prompt,
    });

    return new AgentExecutor({
        agent,
        tools,
        verbose: true,
    });
}

const steps = [
    {
        name: 'calendar_research',
        prompt: `You have access to Google Calendar tools: GOOGLECALENDAR_FIND_EVENT and GOOGLECALENDAR_GET_CALENDAR.

Use these tools to:
1. First, use GOOGLECALENDAR_GET_CALENDAR to fetch the calendar
2. Then, use GOOGLECALENDAR_FIND_EVENT to find the next upcoming event

Return the event details including:
- Attendees
- Time
- Description
- Location

Make sure to execute these calendar actions and return the results in a structured format.`,
        tools: ["GOOGLECALENDAR_FIND_EVENT", "GOOGLECALENDAR_GET_CALENDAR"],
        processOutput: (output) => {
            try {
                const parsed = typeof output === 'string' ? JSON.parse(output) : output;
                return {
                    attendees: parsed.attendees || [],
                    meetingTime: parsed.time || '',
                    description: parsed.description || '',
                    location: parsed.location || '',
                    rawOutput: output
                };
            } catch (e) {
                console.log("Error parsing calendar output:", e);
                return { rawOutput: output };
            }
        }
    },
    {
        name: 'attendee_research',
        prompt: (context) => `You have access to web scraping tools: FIRECRAWL_SCRAPE and FIRECRAWL_SEARCH.

        Meeting Context:
        Time: ${context.calendar_research.meetingTime}
        Description: ${context.calendar_research.description}
        Attendees: ${JSON.stringify(context.calendar_research.attendees)}

        Your tasks:
        1. For each attendee, use FIRECRAWL_SEARCH and EXA_SEARCH to find their LinkedIn profile URL
        2. Then use FIRECRAWL_SCRAPE to extract detailed information from each profile

        For each attendee, collect:
        - Current role and company
        - Professional background
        - Recent activities

        Make sure to execute these search and scrape actions for each attendee and return the compiled information in a structured format.`,
        tools: ["EXA_SEARCH","FIRECRAWL_SCRAPE", "FIRECRAWL_SEARCH"],
        processOutput: (output) => {
            try {
                const parsed = typeof output === 'string' ? JSON.parse(output) : output;
                return {
                    attendeeProfiles: parsed.profiles || parsed,
                    rawOutput: output
                };
            } catch (e) {
                console.log("Error parsing attendee research output:", e);
                return { rawOutput: output };
            }
        }
    },
    {
        name: 'email_research',
        prompt: (context) => `You have access to Gmail tools: GMAIL_FETCH_EMAILS, GMAIL_LIST_THREADS, and GMAIL_GET_PROFILE.

Meeting Context:
Time: ${context.calendar_research.meetingTime}
Attendees: ${JSON.stringify(context.calendar_research.attendees)}

Execute these steps:
1. Use GMAIL_GET_PROFILE to confirm the email account access
2. Use GMAIL_LIST_THREADS to find recent threads with the meeting attendees
3. Use GMAIL_FETCH_EMAILS to get the content of latest 5 emails pass the attendee email id as query

Look for:
- Recent email threads with these attendees
- Meeting agenda or preparation materials
- Previous meeting notes if this is recurring

Focus on emails from the past week related to this meeting.
Make sure to execute these email actions and return the findings in a structured format.`,
        tools: ["GMAIL_FETCH_EMAILS", "GMAIL_LIST_THREADS", "GMAIL_GET_PROFILE"],
        processOutput: (output) => {
            try {
                const parsed = typeof output === 'string' ? JSON.parse(output) : output;
                return {
                    relevantEmails: parsed.emails || parsed,
                    rawOutput: output
                };
            } catch (e) {
                console.log("Error parsing email research output:", e);
                return { rawOutput: output };
            }
        }
    },
    {
        name: 'summarize_and_notify',
        prompt: (context) => `You have access to Slack messaging tool: SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL.
        Send it to the channel id C074KJ7HWCS

Create a meeting brief using this research:

1. Meeting Details:
${JSON.stringify(context.calendar_research, null, 2)}

2. Attendee Profiles:
${JSON.stringify(context.attendee_research.attendeeProfiles, null, 2)}

3. Relevant Emails:
${JSON.stringify(context.email_research.relevantEmails, null, 2)}

Your tasks:
1. Compile a clear, concise summary including:
   - Meeting basics (time, location)
   - Key points about attendees
   - Preparation materials found
   - Important context from emails

2. Use SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL to send this summary to the general channel with id C074KJ7HWCS

Make sure to execute the Slack message action and confirm the message was sent.`,
        tools: ["SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL"],
        processOutput: (output) => {
            return {
                sentMessage: true,
                summary: output,
                rawOutput: output
            };
        }
    }
];

async function executeStep(executor, step, context) {
    console.log(`\n=== Executing Step: ${step.name} ===`);
    console.log('Available Tools:', step.tools);
    console.log('Current Context:', JSON.stringify(context, null, 2));

    const prompt = typeof step.prompt === 'function' 
        ? step.prompt(context)
        : step.prompt;

    console.log('Generated Prompt:', prompt);

    const result = await executor.invoke({
        input: prompt,
        context: context
    });

    console.log('Raw Step Result:', result);

    const processedOutput = step.processOutput(result.output);
    console.log('Processed Output:', processedOutput);

    return processedOutput;
}

async function executeSteppedAgent() {
    try {
        const llm = new ChatOpenAI({
            model: "gpt-4o",
        });

        const toolset = new LangchainToolSet({
            apiKey: process.env.COMPOSIO_API_KEY,
        });

        const prompt = await pull("hwchase17/openai-functions-agent");
        let context = {};

        for (let i = 0; i < steps.length; i += 2) {
            const currentPair = steps.slice(i, i + 2);
            const requiredTools = [...new Set(currentPair.flatMap(step => step.tools))];
            
            const tools = await toolset.get_actions({
                actions: requiredTools
            });

            const executor = await createAgentExecutor(llm, tools, prompt);

            for (const step of currentPair) {
                if (!step) continue;

                const stepResult = await executeStep(executor, step, context);
                context[step.name] = stepResult;

                console.log(`\nCompleted ${step.name}:`);
                console.log('Updated Context:', JSON.stringify(context, null, 2));
            }
        }

        return context;
    } catch (error) {
        console.error('Error in executeSteppedAgent:', error);
        throw error;
    }
}

(async () => {
    try {
        const results = await executeSteppedAgent();
        console.log('Final Results:', JSON.stringify(results, null, 2));
    } catch (error) {
        console.error('Error in main execution:', error);
    }
})();

export default app;