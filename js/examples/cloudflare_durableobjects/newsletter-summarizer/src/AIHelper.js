import { CloudflareToolSet } from 'composio-core';
import OpenAI from 'openai';

const config = {
  model: '@hf/nousresearch/hermes-2-pro-mistral-7b',
};

export class AIHelper {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connection = null;
    this.history = [];
  }

  async fetch(request) {
    const url = new URL(request.url);
    console.log(`Received request for path: ${url.pathname}`);

    if (url.pathname === '/help') {
      try {
        const body = await request.json();
        console.log('Request body:', body);

        if (body.entityId) {
          console.log('Handling setup request');
          const setupResponse = await this.setupUserConnection(body.entityId);

          if (setupResponse.status === 200) {
            console.log('Connection established, proceeding with newsletter summarization');
            return await this.handleNewsletterSummarization();
          } else {
            return setupResponse;
          }
        } else {
          console.log('Handling newsletter summarization directly');
          return await this.handleNewsletterSummarization();
        }
      } catch (error) {
        console.error('Error processing request:', error);
        return new Response('Internal Server Error', { status: 500 });
      }
    }

    console.log('Route not found');
    return new Response('Not Found', { status: 404 });
  }

  async setupUserConnection(entityId) {
    try {
      console.log('Setting up user connection for entityId:', entityId);
      const toolset = new CloudflareToolSet({ apiKey: this.env.COMPOSIO_API_KEY });
      const entity = await toolset.client.getEntity(entityId);
      const connection = await entity.getConnection('gmail');

      if (!connection) {
        const newConnection = await entity.initiateConnection('gmail');
        console.log('New connection initiated');
        return new Response(
          JSON.stringify({
            redirectUrl: newConnection.redirectUrl,
            message: 'Please log in to continue and then call this API again',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      this.connection = connection;
      await this.state.storage.put('connection', connection);
      console.log('Connection established and stored');
      return new Response(JSON.stringify({ message: 'Connection established' }), { status: 200 });
    } catch (error) {
      console.error('Error in setupUserConnection:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  async handleNewsletterSummarization() {
    try {
      console.log('Handling newsletter summarization');
      let toolset, connection, entity, fetchTools, sendTools;
  
      toolset = new CloudflareToolSet({ apiKey: this.env.COMPOSIO_API_KEY });
      connection = await this.state.storage.get('connection');
      
      if (!connection) {
        console.log('No connection found');
        return new Response('Connection not found. Set up a user connection first.', { status: 400 });
      }
  
      entity = await toolset.client.getEntity('default');
  
      // Step 1: Fetch Emails
      fetchTools = await toolset.getActions(
        { actions: ['gmail_fetch_emails'] },
        entity.id
      );
  
      const fetchInstruction = `
        Fetch the most recent newsletter emails from the inbox.
        Look for emails with subjects containing words like 'newsletter', 'update', or 'digest'.
        Retrieve the content of these emails, including any important links or attachments.
        Pay special attention to newsletters from reputable sources and industry leaders.
      `;
  
      let fetchMessages = [
        { role: 'system', content: 'You are an AI assistant that fetches newsletter emails.' },
        { role: 'user', content: fetchInstruction },
      ];
  
      console.log('Running AI model for email fetching');
      const fetchToolCallResp = await this.env.AI.run(config.model, {
        messages: fetchMessages,
        tools: fetchTools,
      });
  
      console.log('Handling fetch tool call');
      const fetchedEmails = await toolset.handleToolCall(fetchToolCallResp, entity.id);
  
      // Step 2: Summarize Emails using OpenAI API
      console.log('Summarizing emails using OpenAI API');
      const openai = new OpenAI({apiKey:this.env.OPENAI_API_KEY});
      const summaryResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant that summarizes newsletter emails." },
          { role: "user", content: `Summarize the following emails in 2 lines concisely: ${JSON.stringify(fetchedEmails)}` }
        ]
      });
      const summary = summaryResponse.choices[0].message.content;
  
      // Step 3: Send Summarized Email
      sendTools = await toolset.getActions(
        { actions: ['GMAIL_SEND_EMAIL'] },
        entity.id
      );
  
      const sendInstruction = `send ${summary} to prathit3.14@gmail.com`;
  
      let sendMessages = [
        { role: 'system', content: 'You are an AI assistant that sends emails using the TOOLS AVAILABLE TO YOU.' },
        { role: 'user', content: sendInstruction },
      ];
  
      console.log('Running AI model for email sending');
      const sendToolCallResp = await this.env.AI.run(config.model, {
        messages: sendMessages,
        tools: sendTools,
        prompt: "you are an ai assistant that uses tools"
      });
  
      console.log('Handling send tool call');
      const resp = await toolset.handleToolCall(sendToolCallResp);
      console.log('Newsletter summarization and sending completed successfully');
      return new Response(JSON.stringify({ message: 'Newsletter summarized and sent' }), { status: 200 });
    } catch (err) {
      console.error('Specific error in handleNewsletterSummarization:', err);
      if (err instanceof TypeError) {
        return new Response(JSON.stringify({ error: 'Invalid input type' }), { status: 400 });
      }
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
  }
}