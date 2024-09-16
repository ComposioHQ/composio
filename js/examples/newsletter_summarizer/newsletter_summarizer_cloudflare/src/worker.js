import { Hono } from 'hono';
import { CloudflareToolSet } from "composio-core"
const app = new Hono();

// Configuration for the AI model
const config = {
  model: '@hf/nousresearch/hermes-2-pro-mistral-7b',
};


// Function to set up the GitHub connection for the user if it doesn't exist
async function setupUserConnectionIfNotExists(toolset, entityId, c) {
  const entity = await toolset.client.getEntity(entityId);
  const connection = await entity.getConnection('github');

  if (!connection) {
    // If the user hasn't connected their GitHub account
    const connection = await entity.initiateConnection('github');
    console.log('Log in via: ', connection.redirectUrl);
    c.json({ redirectUrl: connection.redirectUrl, message: 'Please log in to continue and then call this API again' });
  }

  return connection;
}


// POST endpoint to handle the AI request
app.post('/help', async (c) => {
  // Initialize the CloudflareToolSet with the API key
  const toolset = new CloudflareToolSet({
    apiKey: c.env.COMPOSIO_API_KEY,
  });

  try {
    const entity = await toolset.client.getEntity('default');
    await setupUserConnectionIfNotExists(toolset, entity.id, c);
    // Get the required tools for the AI task
    const tools = await toolset.getActions({ actions: ['gmail_fetch_emails','gmail_send_email'] }, entity.id);
    const instruction = `
            "Fetch the most recent newsletter emails from the inbox. "
        "Look for emails with subjects containing words like 'newsletter', 'update', or 'digest'. "
        "Retrieve the content of these emails, including any important links or attachments. "
        "Pay special attention to newsletters from reputable sources and industry leaders."
            "Compose and send an email containing the summarized newsletter content. "
        "Use the Gmail API to send the email to investtradegame@gmail.com. "
        "Ensure the email has a clear, engaging subject line and well-formatted content. "
        "Use the following structure for the email:\n\n"
        f"Subject: Your Weekly News Digest - {datetime.now().strftime('%B %d, %Y')}\n\n"
        "<h1>Weekly News Digest</h1>\n\n"
        "<p>Dear Reader,</p>\n\n"
        "<p>Here's your curated summary of this week's top news items and insights:</p>\n\n"
        "[Insert summarized content here]\n\n"
        "Each main section should be separated by a horizontal rule, like this:\n"
        "<hr>\n\n"
        "Structure the content logically, with clear sections for each summarized newsletter or topic area.\n"
        "Use appropriate HTML formatting such as <strong> for headlines, "
        "<ul> and <li> for bullet points, and <br> for line breaks to enhance readability.\n\n"
        "Include relevant links using HTML anchor tags: <a href='URL'>Link Text</a>\n\n"
        "Include a brief introduction at the beginning to set the context and a conclusion at the end "
        "to summarize the key takeaways and trends observed across the newsletters.\n\n"
        "<footer>\n"
        "<p>For more details on these stories, click on the provided links or stay tuned to our next update. "
        "If you have any questions or feedback, please don't hesitate to reach out.</p>\n\n"
        "<p>Best regards,<br>Your Newsletter Summary Team</p>\n"
        "</footer>\n\n"
        "Important: Ensure all HTML tags are properly closed and nested correctly.
        `;

    // Set up the initial messages for the AI model
    let messages = [
      { role: 'system', content: '' },
      { role: 'user', content: instruction },
    ];

    // Run the AI model with the messages and tools
    const toolCallResp = await c.env.AI.run(config.model, {
      messages,
      tools,
    });

    // Handle the tool call response
    await toolset.handleToolCall(toolCallResp, entity.id);
    return c.json({ messages: "Mails found" });
  } catch (err) {
    console.log(err);
    return c.text('Something went wrong', 500);
  }
});

export default app;
