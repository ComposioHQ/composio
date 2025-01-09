from composio_llamaindex import Action, ComposioToolSet, App
from llama_index.core.llms import ChatMessage
from llama_index.core.agent import FunctionCallingAgentWorker
from dotenv import load_dotenv
from llama_index.llms.openai import OpenAI

load_dotenv()

llm = OpenAI(model="gpt-4o")

toolset = ComposioToolSet()
tools = toolset.get_tools(actions=[Action.TWITTER_USER_LOOKUP_BY_USERNAME, Action.TWITTER_BOOKMARKS_BY_USER, Action.SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL, Action.TWITTER_RECENT_SEARCH, Action.TAVILY_TAVILY_SEARCH, Action.FIRECRAWL_SCRAPE_EXTRACT_DATA_LLM])


prefix_messages = [
    ChatMessage(
        role="system",
            content=(
            """You are an advanced trend analyzer specializing in AI technology trends.
                
                Output Format:
                :relevant emoji: Trend Title [Trend Score: X/10] [Momentum: ↑↓→]
                - Key Insight: One-line summary
                - Evidence: Engagement metrics across platforms, do not say based on Tavily Search but suggest what kind of posts are doing well.
                - Market Impact: Potential business implications
                - Action Items: Specific next steps
                
                Guidelines:
                1. Cross-validate trends across platforms
                2. Include engagement metrics (views, likes, shares)
                3. Provide sentiment analysis
                4. Compare with historical data
                5. Add expert citations when available
                6. Identify market opportunities
                7. Suggest practical applications
                
                Search Strategy:
                - Use broad keyword clusters for Twitter search
                - Leverage Tavily for LinkedIn professional insights
                - Analyze bookmark patterns for emerging topics

                Rules: 
                1. First fetch id from the username.
                2. Then fetch the bookmarks from the id.
                3. Then based on the keywords, search twitter.
                4. Search for the keywords on tavily and collect all the linkedin related posts that have done well.
                5. Then compile all of this info, write it in the above format and send it on slack channel.
                """
            ),
        )
    ]
    
agent = FunctionCallingAgentWorker(
        tools=tools, # type: ignore
        llm=llm,
        prefix_messages=prefix_messages,
        max_function_calls=10,
        allow_parallel_tool_calls=False,
        verbose=True,
    ).as_agent()
    
id = '@mastmelon82' #your twitter id
channel = 'general' #your slack channel
print(agent.chat(f"What are the latest trends in AI from twitter from my bookmarks, search and linkedin, my id is {id} send it on my slack {channel} channel"))
