import {CloudflareToolSet} from 'composio-core';
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
              
              // Check if the connection was established
              if (setupResponse.status === 200) {
                console.log('Connection established, proceeding with AI request');
                if (body.instruction) {
                  console.log('Handling AI request');
                  return await this.handleAIRequest(body.instruction);
                }
              } else {
                return setupResponse;
              }
            } else if (body.instruction) {
              console.log('Handling AI request directly');
              return await this.handleAIRequest(body.instruction);
            } else {
              console.log('Invalid request body');
              return new Response('Invalid request body', { status: 400 });
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
        const connection = await entity.getConnection('googledocs');
  
        if (!connection) {
          const newConnection = await entity.initiateConnection('googledocs');
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
  
    async handleAIRequest(instruction) {
      try {
        console.log('Handling AI request with instruction:', instruction);
        const toolset = new CloudflareToolSet({ apiKey: this.env.COMPOSIO_API_KEY });
        const connection = this.connection || (await this.state.storage.get('connection'));
  
        if (!connection) {
          console.log('No connection found');
          return new Response('Connection not found. Set up a user connection first.', { status: 400 });
        }
  
        const entity = await toolset.client.getEntity('default');
        const tools = await toolset.getActions(
          { actions: ['gmail_send_email'] },
          entity.id
        );
  
        let messages = [
          { role: 'system', content: 'You are an AI assistant that sends emails as per '+instruction },
          { role: 'user', content: instruction },
        ];
  
        console.log('Running AI model');
        const toolCallResp = await this.env.AI.run('@hf/nousresearch/hermes-2-pro-mistral-7b', {
          messages,
          tools,
          prompt:"You are an AI assistant that sends emails as per the instructions to the id mentioned in it"
        });
  
        console.log('Handling tool call');
        const resp = await toolset.handleToolCall(toolCallResp, entity.id);
  
        console.log('AI request completed successfully');
        return new Response(JSON.stringify({ message:resp }), { status: 200 });
      } catch (err) {
        console.error('Error in handleAIRequest:', err);
        return new Response('Something went wrong', { status: 500 });
      }
    }
  }