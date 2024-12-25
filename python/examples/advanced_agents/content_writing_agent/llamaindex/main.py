from composio_llamaindex import ComposioToolSet, App, Action
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.openai import OpenAI
from llama_index.llms.cerebras import Cerebras
from dotenv import load_dotenv

import json

# Load environment variables
load_dotenv()

# Initialize toolset and LLM
toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[
    Action.TWITTER_CREATION_OF_A_POST, 
    Action.TWITTER_POST_LOOKUP_BY_POST_ID,
    Action.FIRECRAWL_CRAWL_URLS, 
    Action.TAVILY_TAVILY_SEARCH, 
    Action.GOOGLESHEETS_CREATE_GOOGLE_SHEET1, 
    Action.GOOGLESHEETS_BATCH_UPDATE,
    Action.LINKEDIN_CREATE_LINKED_IN_POST,])

llm = OpenAI(model="gpt-4o")
#llm = Cerebras(model="llama-3.3-70b", is_chat_model=True)
# Define file paths for saving ideas and generated content
content_ideas_file = "content_ideas.json"
generated_content_file = "generated_content.json"

# Setup chatbot-style prefix messages
def create_prefix_message():
    return [
        ChatMessage(
            role="system",
            content=(
                """
                You are a creative content automation agent. Your tasks are:
                1. Scrape the internet for the latest news and trending content using FIRECRAWL.
                2. Suggest content ideas based on your findings and any specified topics or categories.
                3. Ask the user to pick an idea.
                4. Generate detailed written content for the chosen idea.
                5. Save the chosen idea and the written content to files for future reference.
                6. Optionally, post the generated content on Twitter or LinkedIn with the user's permission.
                """
            ),
        )
    ]

prefix_messages = create_prefix_message()

# Initialize the agent
agent = FunctionCallingAgentWorker(
    tools=tools,
    llm=llm,
    prefix_messages=prefix_messages,
    max_function_calls=10,
    allow_parallel_tool_calls=False,
    verbose=True,
).as_agent()

# Task-specific logic in a chatbot-like flow
def chatbot():
    print("🤖: Hi! I can help you create content based on the latest trends. Let’s start!")
    
    # Step 1: Ask the user for a content topic
    category = input(
        "🤖: What category of content are you looking for? (e.g., Technology, Health, Business, Entertainment): "
    ).strip()
    
    # Step 2: Scrape the internet for trending content in the specified category
    task = f"Find the latest news and suggest 10 content ideas in the \"{category}\" category. "
    ideas_response = agent.chat(task)
    print(f"\n🤖: Here are some content ideas I found in the \"{category}\" category:\n")
        
    chosen_idea = input("\n🤖: Which idea do you like the most? (Enter a number)")
    print(f"\n🤖: Great! You chose: \"{chosen_idea}\". I'll generate content for you.\n")
    
    # Step 4: Save the chosen idea to a file
    try:
        with open(content_ideas_file, "w") as f:
            json.dump({"chosen_idea": chosen_idea}, f, indent=2)
        print("🤖: Done! Your idea has been saved for future reference.")
    except Exception as e:
        print(f"🤖: Oops! I ran into an issue while saving your idea: {e}")
    
    # Step 5: Generate written content based on the chosen idea
    content_task = f"Write detailed content based on the following idea: \"{chosen_idea}\". Please don't add any text after or before the blog post asking me any kind of questions or telling me anything. I only want the blog post content."
    content_response = agent.chat(content_task)
    generated_content = content_response.response
    
    # Step 6: Save the generated content to a file
    try:
        with open(generated_content_file, "w") as f:
            json.dump({"chosen_idea": chosen_idea, "content": generated_content}, f, indent=2)
        with open(f"{chosen_idea}.md", "w") as f:
            f.write(generated_content)
        print(f"🤖: Done! The written long form content has been saved:\n{generated_content}\n")
    except Exception as e:
        print(f"🤖: Oops! I ran into an issue while saving your content: {e}")
    
    # Step 7: Ask the user where they want to post the content
    platform = input("🤖: Would you like to post the content on Twitter or LinkedIn? (Enter 'Twitter' or 'LinkedIn'): ").strip().lower()
    
    if platform == "twitter":
        twitter_thread = agent.chat("Don't write it in markdown.Write a twitter thread from the blog, shouldn't be beyond 5-7 posts. Dont add hashtags, tweets shouldn't be too short and surfacial.")
        twitter_task = f"Post the following content on Twitter: \"{twitter_thread.response}\". Post it as a series of threads, quote each tweet in the next one. Print the final link to the tweet."
        twitter_response = agent.chat(twitter_task)
        print(f"🤖: I posted the content to Twitter! Here's the post: {twitter_response}")
    
    elif platform == "linkedin":
        linkedin_post = agent.chat(f"Dont write it in markdown. Write a LinkedIn post from the blog content, dont use emojis: \"{generated_content}\".")
        linkedin_task = f"Post the following content on LinkedIn: \"{linkedin_post.response}\"."
        linkedin_response = agent.chat(linkedin_task)
        print(f"🤖: I posted the content to LinkedIn! Here's the post: {linkedin_response}")
    
    else:
        print("🤖: I'm sorry, I can only post on Twitter or LinkedIn. Let me know if you'd like help with something else!")

# Start the chatbot interaction
if __name__ == "__main__":
    chatbot()
