import os
from aioconsole import aprint
import dotenv
import asyncio
import json
import random
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sse_starlette.sse import EventSourceResponse
from typing import List, Dict, Any, AsyncGenerator

from composio_llamaindex import App, ComposioToolSet
from llama_index.core.agent import FunctionCallingAgentWorker
from llama_index.core.llms import ChatMessage
from llama_index.llms.groq import Groq

dotenv.load_dotenv()

app = FastAPI()
app.mount("/static", StaticFiles(directory="python/examples/advanced_agents/game_builder/llama-4/static"), name="static")
templates = Jinja2Templates(directory="python/examples/advanced_agents/game_builder/llama-4/templates")

composio_toolset = ComposioToolSet()
fetched_tools = composio_toolset.get_tools(apps=[App.COMPOSIO_SEARCH])
agent_tools: List[Any] = list(fetched_tools)

llm = Groq(model='meta-llama/llama-4-scout-17b-16e-instruct', api_key=os.environ.get('GROQ_API_KEY'))

RESEARCHER_NAME = "Researcher"
FAMOUS_AGENT_NAMES = ["Elon Musk", "Marc Andreessen", "Sam Altman", "Naval Ravikant", "Paul Graham", "Balaji Srinivasan", "Pieter Levels"]
REACTION_AGENT_NAMES = FAMOUS_AGENT_NAMES

PROFILE_PICS = {
    "Elon Musk": "https://x.com/elonmusk/photo",
    "Marc Andreessen": "https://x.com/pmarca/photo",
    "Sam Altman": "https://x.com/sama/photo",
    "Naval Ravikant": "https://x.com/naval/photo",
    "Paul Graham": "https://x.com/paulg/photo",
    "Balaji Srinivasan": "https://x.com/balajis/photo",
    "Pieter Levels": "https://x.com/levelsio/photo"
}

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
}

async def stream_simulation(topic: str) -> AsyncGenerator[str, None]:
    simulation_history: List[Dict[str, str]] = []
    agents = {}
    research_summary = "No research summary generated."

    try:
        for name, persona_msg in AGENT_PERSONAS.items():
            agents[name] = FunctionCallingAgentWorker(
                tools=agent_tools,
                llm=llm,
                prefix_messages=[persona_msg],
                max_function_calls=5,
                allow_parallel_tool_calls=False,
                verbose=False,
            ).as_agent()
    except Exception as e:
        yield json.dumps({"role": "System Error", "content": f"Server error during agent setup: {e}"})
        return

    try:
        researcher_agent = agents[RESEARCHER_NAME]
        research_prompt = f"Research the topic: '{topic}' and provide a very brief (2-3 key bullet points or sentences) summary."
        try:
            status_update = {"role": "System Status", "content": f"Researcher is gathering information on '{topic}'..."}
            yield json.dumps(status_update)
            response = await researcher_agent.achat(research_prompt)
            research_summary = response.response.strip()
            if not research_summary:
                 research_summary = "Researcher did not produce a summary."
        except Exception as e:
            research_summary = f"Error during research phase: {e}"
            error_update = {"role": "System Error", "content": f"Error during research: {e}"}
            yield json.dumps(error_update)

        num_turns = 1
        for turn in range(num_turns):
            for name in REACTION_AGENT_NAMES:
                agent = agents[name]
                prompt = (
                    f"Topic: '{topic}'\n\n"
                    f"Research Summary Provided:\n{research_summary}\n\n"
                    f"Remember your persona and instructions. Focus SOLELY on your unique perspective reacting ONLY to the research summary and topic. Output ONLY the tweet text."
                )
                tweet_data = {}
                tweet_content = ""
                try:
                    response = await agent.achat(prompt)
                    tweet_content = response.response.strip()
                except AttributeError:
                    response = agent.chat(prompt)
                    tweet_content = response.response.strip()
                except Exception as e:
                    tweet_content = f"[Error generating tweet for {name}]"

                profile_pic_url = PROFILE_PICS.get(name)

                if not tweet_content or tweet_content.lower() == 'none':
                    tweet_content = f"[{name} did not generate a tweet.]"
                    tweet_data = {"role": "System Info", "content": tweet_content}
                else:
                    likes = random.randint(0, 1000)
                    tweet_data = {
                        "role": name,
                        "content": tweet_content,
                        "likes": likes,
                        "profile_pic_url": profile_pic_url
                    }

                history_entry = {"role": name, "content": tweet_content}
                simulation_history.append(history_entry)
                yield json.dumps(tweet_data)

        completion_data = {"role": "System", "content": "Simulation Complete"}
        yield json.dumps(completion_data)

    except asyncio.CancelledError:
        print("[STREAM] Client disconnected.")
    except Exception as e:
        try:
            error_data = {"role": "System Error", "content": f"An unexpected server error occurred: {e}"}
            yield json.dumps(error_data)
        except Exception as final_e:
            print(f"[STREAM] Error yielding final error message: {final_e}")
    finally:
        print("[STREAM] Simulation stream finished.")

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/simulation_stream")
async def simulation_endpoint(topic: str = Query(...)):
    return EventSourceResponse(stream_simulation(topic))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend_main:app", host="0.0.0.0", port=8000, reload=True)
