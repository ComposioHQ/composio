import os
from aioconsole import aprint
import dotenv
import asyncio # Needed for sleep
import json # Needed for SSE data
import random # Import the random module
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse # JSONResponse removed
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sse_starlette.sse import EventSourceResponse # Import SSE response
# Pydantic model no longer needed for POST
from typing import List, Dict, Any, AsyncGenerator

from composio_llamaindex import App, ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.groq import Groq

dotenv.load_dotenv()

# --- FastAPI Setup ---
app = FastAPI()
app.mount("/static", StaticFiles(directory="python/examples/advanced_agents/game_builder/llama-4/static"), name="static")
templates = Jinja2Templates(directory="python/examples/advanced_agents/game_builder/llama-4/templates")

# --- LlamaIndex/Agent Setup ---
composio_toolset = ComposioToolSet()
# Ensure tools are fetched once and cast to list for type compatibility
fetched_tools = composio_toolset.get_tools(apps=[App.COMPOSIO_SEARCH])
agent_tools: List[Any] = list(fetched_tools) # Cast to list[Any] or list[BaseTool] if importable

llm = Groq(model='meta-llama/llama-4-scout-17b-16e-instruct', api_key=os.environ.get('GROQ_API_KEY'))

RESEARCHER_NAME = "Researcher"
# Define the new list of famous entrepreneurs
FAMOUS_AGENT_NAMES = ["Elon Musk", "Marc Andreessen", "Sam Altman", "Naval Ravikant", "Paul Graham", "Balaji Srinivasan", "Pieter Levels"]
REACTION_AGENT_NAMES = FAMOUS_AGENT_NAMES # Use the new list

# --- Add Profile Picture Mapping ---
PROFILE_PICS = {
    "Elon Musk": "https://x.com/elonmusk/photo", # Using unavatar for better reliability
    "Marc Andreessen": "https://x.com/pmarca/photo",
    "Sam Altman": "https://x.com/sama/photo",
    "Naval Ravikant": "https://x.com/naval/photo",
    "Paul Graham": "https://x.com/paulg/photo",
    "Balaji Srinivasan": "https://x.com/balajis/photo",
    "Pieter Levels": "https://x.com/levelsio/photo"
    # Add others if needed
}
# --- End Profile Picture Mapping ---

AGENT_PERSONAS = {
    RESEARCHER_NAME: ChatMessage(
        role="system",
        content=(
            f"You are the {RESEARCHER_NAME}. Your sole task is to research a given topic. "
            "Your process: "
            "1. **Research:** Use the EXA_SEARCH tool to find relevant information about the topic. Focus on key features, recent news, and general sentiment. "
            "2. **Summarize Concisely:** Synthesize your findings into a **very brief** (2-3 key bullet points or sentences) summary. This summary must be concise to avoid exceeding limits. It will be used by other agents. "
            "**Constraint:** Your final output MUST ONLY be the concise research summary text. No extra greetings or commentary."
        )
    ),
    # --- Refined & New Entrepreneur Personas --- 
    "Elon Musk": ChatMessage(
        role="system",
        content=(
            "You are Elon Musk. React to the topic/summary with a short, direct tweet (max 280 chars). "
            "Make a bold statement, announce something matter-of-factly, or offer a blunt take. **Take a contrarian stance, disagreeing with the mainstream sentiment or likely views of others (like Sam Altman).** Simple language. "
            "Output ONLY the tweet text. No hashtags. Example style: 'There was (still is) a massive cyberattack against X.' or 'I expected to lose, but there is value to losing a piece for a positional gain.'"
        )
    ),
    "Marc Andreessen": ChatMessage(
        role="system",
        content=(
            "You are Marc Andreessen. React to the topic/summary with an enthusiastic, insightful tweet (max 280 chars). "
            "Highlight tech breakthroughs, express techno-optimism, or share an interesting story/example. **Maintain a neutral perspective on the core debate, focusing on the technological or market implications objectively.** Think 'build'. "
            "Output ONLY the tweet text. No hashtags. Example style: 'Deepseek R1 is one of the most amazing and impressive breakthroughs I\'ve ever seen...' or 'Retweet or quote tweet this if you\'ve ever been de-banked...'"
        )
    ),
    "Sam Altman": ChatMessage(
        role="system",
        content=(
            "You are Sam Altman. React to the topic/summary with a concise, thoughtful tweet (max 280 chars). "
            "Share an observation about AI progress, a resource constraint ('GPUs melting'), or a strategic thought. Often use 'we'. Measured tone. "
            "Output ONLY the tweet text. No hashtags. Example style: 'we trained a new model that is good at creative writing...' or 'it\'s super fun seeing people love images in chatgpt. but our GPUs are melting.'"
        )
    ),
    "Naval Ravikant": ChatMessage(
        role="system",
        content=(
            "You are Naval Ravikant. React to the topic/summary with a short, philosophical, aphoristic tweet (max 280 chars). "
            "Distill the essence into a principle about wealth, time, or long-term thinking. Very concise. "
            "Output ONLY the tweet text. No hashtags. Example style: 'Play long-term games with long-term people.' or 'Earn with your mind, not your time.'"
        )
    ),
    "Paul Graham": ChatMessage(
        role="system",
        content=(
            "You are Paul Graham. React to the topic/summary with a concise, insightful tweet (max 280 chars). Focus on subtle observations, identifying patterns, or offering pointed critique/advice related to thinking or building. "
            "Distill a specific observation. **Lean towards supporting the likely perspective of Sam Altman, using your observational style to bolster that view.** "
            "Output ONLY the tweet text. No hashtags. Example style: 'My point here is not that I dislike \'delve,\' though I do, but that it\'s a sign that text was written by ChatGPT.'"
        )
    ),
    "Balaji Srinivasan": ChatMessage(
        role="system",
        content=(
            "You are Balaji Srinivasan. React to the topic/summary with a short, analytical, future-focused tweet (max 280 chars). "
            "Focus on macro trends (reindustrialization, AI overproduction), potential disruptions, or network effects. Can be dense or use strong keywords. "
            "Output ONLY the tweet text. No hashtags. Example style: 'Everyone wants to reindustrialize. No one wants to remember why the US deindustrialized...' or 'AI OVERPRODUCTION China seeks to commoditize...'"
        )
    ),
    "Pieter Levels": ChatMessage(
        role="system",
        content=(
            "You are Pieter Levels (levelsio). React to the topic/summary with a direct, pragmatic tweet based on personal experience or indie hacker reality (max 280 chars). "
            "Challenge conventional wisdom, talk about bootstrapping, or share a blunt observation. Often uses 'I'. "
            "Output ONLY the tweet text. No hashtags. Example style: 'I\'m on 6 grams of Creatine per day...' or 'So many VC funded exits you hear about are actually massive failures...'"
        )
    ),
    # --- End Refined & New Personas ---
}

# --- SSE Simulation Logic ---
async def stream_simulation(topic: str) -> AsyncGenerator[str, None]:
    """Generates tweets one by one, starting with research, and yields them for SSE."""
    print("[STREAM] Starting simulation stream...") # Keep start log
    simulation_history: List[Dict[str, str]] = [] 
    agents = {}
    research_summary = "No research summary generated."

    # Initialize all agents
    try:
        # print("[STREAM] Initializing agents...") # Remove
        for name, persona_msg in AGENT_PERSONAS.items():
            agents[name] = FunctionCallingAgentWorker(
                tools=agent_tools, 
                llm=llm,
                prefix_messages=[persona_msg],
                max_function_calls=5, 
                allow_parallel_tool_calls=False, 
                verbose=False, 
            ).as_agent()
        # print("[STREAM] Agents initialized.") # Remove
    except Exception as e:
        print(f"[STREAM] CRITICAL ERROR during agent initialization: {e}") # Keep critical error log
        yield json.dumps({"role": "System Error", "content": f"Server error during agent setup: {e}"})
        return

    try:
        # --- Research Phase ---
        print(f"[STREAM] Starting Research Phase for topic: {topic}") # Keep phase start log
        researcher_agent = agents[RESEARCHER_NAME]
        research_prompt = f"Research the topic: '{topic}' and provide a very brief (2-3 key bullet points or sentences) summary."
        try:
            status_update = {"role": "System Status", "content": f"Researcher is gathering information on '{topic}'..."}
            # print(f"[STREAM] Yielding status: {status_update}") # Remove
            yield json.dumps(status_update)
            
            # print("[STREAM] Calling researcher_agent.achat...") # Remove
            response = await researcher_agent.achat(research_prompt)
            # print("[STREAM] researcher_agent.achat finished.") # Remove
            research_summary = response.response.strip()
            if not research_summary:
                 research_summary = "Researcher did not produce a summary."
                 # print(f"[STREAM] {research_summary}") # Remove
            # else: 
                 # print(f"[STREAM] Research Summary Generated:") # Remove
        except Exception as e:
            print(f"[STREAM] ERROR during Research Phase execution: {e}") # Keep error log
            research_summary = f"Error during research phase: {e}"
            error_update = {"role": "System Error", "content": f"Error during research: {e}"}
            # print(f"[STREAM] Yielding research error: {error_update}") # Remove
            yield json.dumps(error_update) 

        # --- Reaction Phase ---
        print("[STREAM] Starting Reaction Phase") # Keep phase start log
        num_turns = 1 # Set to 1 turn for 7 agents
        for turn in range(num_turns):
            for name in REACTION_AGENT_NAMES:
                agent = agents[name]
                # print(f"[STREAM] Starting Turn {turn+1} for {name}") # Remove
                
                prompt = (
                    f"Topic: '{topic}'\n\n" 
                    f"Research Summary Provided:\n{research_summary}\n\n" 
                    f"Remember your persona and instructions. Focus SOLELY on your unique perspective reacting ONLY to the research summary and topic. Output ONLY the tweet text."
                )
                
                tweet_data = {}
                tweet_content = ""
                try:
                    # print(f"[STREAM] Calling agent.achat for {name}...") # Remove
                    response = await agent.achat(prompt)
                    # print(f"[STREAM] agent.achat finished for {name}.") # Remove
                    tweet_content = response.response.strip()
                except AttributeError:
                    # print(f"[STREAM] Warning: agent.achat not found for {name}, using agent.chat potentially blocking.") # Remove warning unless needed
                    response = agent.chat(prompt)
                    tweet_content = response.response.strip()
                except Exception as e:
                    print(f"[STREAM] ERROR during {name}'s turn {turn+1} agent execution: {e}") # Keep error log
                    tweet_content = f"[Error generating tweet for {name}]"
                
                # --- Construct Tweet Data --- 
                profile_pic_url = PROFILE_PICS.get(name) # Get URL from mapping

                if not tweet_content or tweet_content.lower() == 'none':
                    # print(f"[STREAM] Agent {name} returned empty or None response.") # Remove
                    tweet_content = f"[{name} did not generate a tweet.]"
                    # System Info messages likely don't need a profile pic URL passed
                    tweet_data = {"role": "System Info", "content": tweet_content}
                else:
                    likes = random.randint(0, 1000)
                    tweet_data = {
                        "role": name, 
                        "content": tweet_content, 
                        "likes": likes,
                        "profile_pic_url": profile_pic_url # Add URL here
                    }
                # --- End Construct Tweet Data ---

                history_entry = {"role": name, "content": tweet_content}
                simulation_history.append(history_entry)
                
                # print(f"[STREAM] Yielding tweet data: {tweet_data}") # Remove
                yield json.dumps(tweet_data)
                
                # print(f"[STREAM] Sleeping for 2s after {name}'s turn...") # Remove
                # await asyncio.sleep(2) # REMOVE THE SLEEP
        
        completion_data = {"role": "System", "content": "Simulation Complete"}
        # print(f"[STREAM] Yielding completion: {completion_data}") # Remove
        yield json.dumps(completion_data)

    except asyncio.CancelledError:
        print("[STREAM] Client disconnected.") # Keep disconnect log
    except Exception as e:
        print(f"[STREAM] UNEXPECTED ERROR in stream_simulation main loop: {e}") # Keep unexpected error log
        try:
            error_data = {"role": "System Error", "content": f"An unexpected server error occurred: {e}"}
            # print(f"[STREAM] Yielding unexpected error: {error_data}") # Remove
            yield json.dumps(error_data)
        except Exception as final_e:
            print(f"[STREAM] Error yielding final error message: {final_e}") # Keep final error log
    finally:
        print("[STREAM] Simulation stream finished.") # Keep end log

# --- FastAPI Endpoints ---
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/simulation_stream")
async def simulation_endpoint(topic: str = Query(...)):
    """Endpoint to stream simulation tweets using SSE."""
    print(f"Received simulation stream request for topic: {topic}") # Server log
    return EventSourceResponse(stream_simulation(topic))

# Removed the old POST /run_simulation endpoint
# Removed Pydantic request model

# --- Run Server (for local testing) ---
if __name__ == "__main__":
    import uvicorn
    # Recommended way to run: uvicorn backend_main:app --reload --port 8000
    uvicorn.run("backend_main:app", host="0.0.0.0", port=8000, reload=True)
