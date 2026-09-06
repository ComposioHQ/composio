<p align="center">
  <a href="https://composio.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://brand.composio.dev/logos/Logomark-White.svg">
      <img alt="Composio logo" src="https://brand.composio.dev/logos/Logomark-Black.svg" width="96">
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://composio.dev"><b>composio.dev</b></a> •
  <a href="https://docs.composio.dev">Documentation</a> •
  <a href="https://docs.composio.dev/docs/quickstart">Quickstart</a> •
  <a href="https://docs.composio.dev/reference/changelog">Changelog</a>
</p>

<p align="center">
  <a href="https://github.com/ComposioHQ/composio/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/ComposioHQ/composio?style=social" /></a>
  <a href="https://www.npmjs.com/package/@composio/core"><img alt="npm" src="https://img.shields.io/npm/v/@composio/core?label=%40composio%2Fcore" /></a>
  <a href="https://pypi.org/project/composio/"><img alt="PyPI" src="https://img.shields.io/pypi/v/composio?label=composio" /></a>
  <a href="https://discord.gg/composio"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?logo=discord&logoColor=white" /></a>
  <a href="https://hvtracker.net/agents/composio/"><img alt="HVTrust" src="https://hvtracker.net/badge/composio.svg" /></a>
</p>

# Composio

Composio gives your AI agents 1000+ pre-authenticated toolkits, per-user sessions, authentication, triggers, and a sandbox, so you can ship agents that turn intent into action.

This is the Composio SDK monorepo. It contains:

- **[`@composio/core`](ts/packages/core)**: TypeScript SDK
- **[`composio`](python)**: Python SDK
- **[`composio` CLI](ts/packages/cli)**: search, execute, and script tools from your shell
- **Provider adapters** for OpenAI Agents, Claude Agent SDK, Vercel AI SDK, LangChain, and [more](#providers)

## Quickstart

Create a session for a user, hand its tools to your agent, and let the agent take action across 1000+ apps. Grab a `COMPOSIO_API_KEY` from the [dashboard](https://dashboard.composio.dev/settings) first.

### TypeScript

```bash
npm install @composio/core @composio/openai-agents @openai/agents
```

> `@composio/core` intentionally packages its TypeScript source and SDK docs so the installed package is inspectable to coding agents. If you want a smaller install with the same API, use [`@composio/slim`](ts/packages/slim).

```typescript
import { Composio } from "@composio/core";
import { OpenAIAgentsProvider } from "@composio/openai-agents";
import { Agent, run } from "@openai/agents";

const composio = new Composio({ provider: new OpenAIAgentsProvider() });

// Each session is scoped to one of your users
const session = await composio.create("user_123");
const tools = await session.tools();

const agent = new Agent({
  name: "Personal Assistant",
  instructions: "You are a helpful assistant. Use Composio tools to take action.",
  tools,
});

const result = await run(agent, "Summarize my emails from today");
console.log(result.finalOutput);
```

### Python

```bash
pip install composio composio-openai-agents openai-agents
```

```python
from composio import Composio
from composio_openai_agents import OpenAIAgentsProvider
from agents import Agent, Runner

composio = Composio(provider=OpenAIAgentsProvider())

# Each session is scoped to one of your users
session = composio.create(user_id="user_123")
tools = session.tools()

agent = Agent(
    name="Personal Assistant",
    instructions="You are a helpful assistant. Use Composio tools to take action.",
    tools=tools,
)

result = Runner.run_sync(starting_agent=agent, input="Summarize my emails from today")
print(result.final_output)
```

By default a session gets meta tools that discover, authenticate, and execute app tools at runtime, so you don't load hundreds of tool definitions into context. Store `session.session_id` and reuse it with `composio.use()` across turns. See [what a session is](https://docs.composio.dev/docs/how-composio-works) and [configuring sessions](https://docs.composio.dev/docs/configuring-sessions) for restricting toolkits, auth configs, and connected accounts.

**Prefer MCP?** Every session also exposes a hosted MCP endpoint. Pass `mcp: true` to `composio.create()` and point Claude, Cursor, or any MCP client at `session.mcp.url`. See [sessions via MCP](https://docs.composio.dev/docs/sessions-via-mcp).

## CLI

The `composio` CLI runs Composio from your shell and gives coding agents like Claude Code a local tool surface.

```bash
curl -fsSL https://composio.dev/install | sh
```

The installer puts `composio` on your `PATH` for future terminals. Open a new terminal, then run `composio login`. See [INSTALL.md](INSTALL.md) for shell setup overrides, including `COMPOSIO_INSTALL_SHELL=none` for install-only runs.

Use `composio search` to find tools, `composio execute` to run them, `composio link` to connect accounts, and `composio run` to script workflows in TypeScript. See the [CLI docs](https://docs.composio.dev/docs/cli).

## Providers

A provider adapts Composio tools to your agent framework's native tool format:

| Provider | TypeScript | Python |
|----------|:----------:|:------:|
| OpenAI | [`@composio/openai`](ts/packages/providers/openai) | [`composio-openai`](python/providers/openai) |
| OpenAI Agents | [`@composio/openai-agents`](ts/packages/providers/openai-agents) | [`composio-openai-agents`](python/providers/openai_agents) |
| Anthropic | [`@composio/anthropic`](ts/packages/providers/anthropic) | [`composio-anthropic`](python/providers/anthropic) |
| Claude Agent SDK | [`@composio/claude-agent-sdk`](ts/packages/providers/claude-agent-sdk) | [`composio-claude-agent-sdk`](python/providers/claude_agent_sdk) |
| Vercel AI SDK | [`@composio/vercel`](ts/packages/providers/vercel) | — |
| Google GenAI | [`@composio/google`](ts/packages/providers/google) | [`composio-gemini`](python/providers/gemini), [`composio-google`](python/providers/google) |
| Google ADK | — | [`composio-google-adk`](python/providers/google_adk) |
| LangChain | [`@composio/langchain`](ts/packages/providers/langchain) | [`composio-langchain`](python/providers/langchain) |
| LangGraph | via `@composio/langchain` | [`composio-langgraph`](python/providers/langgraph) |
| LlamaIndex | [`@composio/llamaindex`](ts/packages/providers/llamaindex) | [`composio-llamaindex`](python/providers/llamaindex) |
| Mastra | [`@composio/mastra`](ts/packages/providers/mastra) | — |
| Pi | [`@composio/experimental`](ts/packages/experimental)* | — |
| Cloudflare Workers AI | [`@composio/cloudflare`](ts/packages/providers/cloudflare) | — |
| CrewAI | — | [`composio-crewai`](python/providers/crewai) |
| AutoGen | — | [`composio-autogen`](python/providers/autogen) |

\* *The [Pi provider](https://docs.composio.dev/docs/providers/pi) is experimental and ships from `@composio/experimental`.*

Don't see your framework? [Build a custom provider](https://docs.composio.dev/docs/providers/custom-providers), or skip providers entirely and connect over [MCP](https://docs.composio.dev/docs/sessions-via-mcp).

## All packages

Everything published from this repo:

| Package | Description |
|---------|-------------|
| [`@composio/core`](ts/packages/core) | TypeScript SDK |
| [`@composio/slim`](ts/packages/slim) | `@composio/core` without packaged source or docs; same API, smaller install |
| [`composio` CLI](ts/packages/cli) | Standalone CLI binary: `curl -fsSL https://composio.dev/install \| sh` |
| [`@composio/experimental`](ts/packages/experimental) | Experimental integrations, including the Pi provider |
| [`@composio/json-schema-to-zod`](ts/packages/json-schema-to-zod) | JSON Schema to Zod conversion |
| `@composio/*` [provider adapters](#providers) | OpenAI, OpenAI Agents, Anthropic, Claude Agent SDK, Vercel, Google, LangChain, LlamaIndex, Mastra, Cloudflare |
| [`composio`](python) | Python SDK |
| `composio-*` [provider adapters](#providers) | OpenAI, OpenAI Agents, Anthropic, Claude Agent SDK, Gemini, Google, Google ADK, LangChain, LangGraph, LlamaIndex, CrewAI, AutoGen |

## Repository layout

```text
ts/                TypeScript SDK workspace
  packages/core/       @composio/core
  packages/providers/  Provider adapters
  packages/cli/        Composio CLI
python/            Python SDK and provider packages
docs/              Documentation site (docs.composio.dev)
```

The TypeScript SDK is tested against Node 22+; the Python SDK supports Python 3.10+.

## Development

```bash
mise install    # pinned toolchain (Node, Python, pnpm)
pnpm install
pnpm build
pnpm test
```

Python commands run from `python/`; see [`python/README.md`](python/README.md). We welcome contributions to both SDKs; read the [contribution guidelines](CONTRIBUTING.md) before submitting pull requests.

## Support

- [Documentation](https://docs.composio.dev)
- [Discord community](https://discord.gg/composio)
- [Open an issue](https://github.com/ComposioHQ/composio/issues)
- [support@composio.dev](mailto:support@composio.dev)

## License

MIT. See [LICENSE](LICENSE).


## 🌐 Web Resources & Interactive Index
- [CATEGORY SOLITAIRE](https://ptskillcrafts.pages.dev/category-solitaire.html)
- [MONSTER DASH](https://studyplaying.github.io/monster-dash.html)
- [CATEGORY PREMIUM PERKS71](https://themindplay.github.io/category-premium-perks71.html)
- [CATEGORY SNIPER39](https://quizverses-9d2f2.web.app/category-sniper39.html)
- [CRAB GUARDS](https://themindplay.pages.dev/crab-guards.html)
- [MERGE RUSH Z](https://thelearnquesters.pages.dev/merge-rush-z.html)
- [FOREST TILES](https://thequizzone.pages.dev/forest-tiles.html)
- [CATEGORY DESTROY256](https://quizverses-9d2f2.web.app/category-destroy256.html)
- [BUTTERFLY MATCH MASTERY](https://themindplaying.web.app/butterfly-match-mastery.html)
- [PUZZLE BLOCKS CLASSIC](https://learnquesters.pages.dev/puzzle-blocks-classic.html)
- [CATEGORY MATCH 3](https://themindplay.github.io/category-match-3.html)
- [PIN PUZZLE LOVE STORY](https://themindzone.pages.dev/pin-puzzle-love-story.html)
- [GYM MUSCLE MERGE TYCOON](https://thelearnquester.web.app/gym-muscle-merge-tycoon.html)
- [CONNECT EM ALL](https://thelearnquester.web.app/connect-em-all.html)
- [MONSTER GIRLS BACK TO SCHOOL](https://thelearnquester.web.app/monster-girls-back-to-school.html)
- [CATEGORY EDUCATIONAL](https://themindplay.github.io/category-educational.html)
- [HOSPITAL INC](https://thelearnquester.web.app/hospital-inc.html)
- [QUACKVENTURE](https://iskillquest.pages.dev/quackventure.html)
- [FLAMES FORTUNE](https://thelearnquester.web.app/flames-fortune.html)
- [PANDA RUNNING](https://thelearnquester.web.app/panda-running.html)
- [ROBYBOX SPACE STATION WAREHOUSE](https://thequizzone.pages.dev/robybox-space-station-warehouse.html)
- [HEROIC KNIGHT](https://themindplaying.web.app/heroic-knight.html)
- [MY HAPPY FARM](https://quizverses.github.io/my-happy-farm.html)
- [CATEGORY MERGE221](https://quizverses.github.io/category-merge221.html)
- [CATEGORY TOWER DEFENSE 2](https://studyquesthub.web.app/category-tower-defense-2.html)
- [CANDY CRUNCH SUGAR ESCAPE](https://themindplaying.web.app/candy-crunch-sugar-escape.html)
- [21A](https://themindzone.pages.dev/21a.html)
- [FIND OBJECTS HIDDEN ITEM](https://thequizzone.pages.dev/find-objects-hidden-item.html)
- [HAPPY ASMR CARE](https://quizverses.github.io/happy-asmr-care.html)
- [CATEGORY ROGUELIKE38](https://learnquester.pages.dev/category-roguelike38.html)
- [CATEGORY CAR 2](https://learnquester.pages.dev/category-car-2.html)
- [CATEGORY BATTLE523](https://quizverses-9d2f2.web.app/category-battle523.html)
- [CATEGORY RPG](https://themindzone.pages.dev/category-rpg.html)
- [CATEGORY ADVENTURE 2](https://quizverses-9d2f2.web.app/category-adventure-2.html)
- [QUACKVENTURE](https://themindplaying.web.app/quackventure.html)
- [PARKING FURY 3D BEACH CITY 2](https://quizverses.github.io/parking-fury-3d-beach-city-2.html)
- [SCREW NUTS BOLTS WOOD SOLVE](https://thelearnquesters.pages.dev/screw-nuts-bolts-wood-solve.html)
- [DRAWING SQUARES](https://thelearnquesters.pages.dev/drawing-squares.html)
- [FIND THE FROG HIDDEN OBJECTS](https://thelearnquesters.pages.dev/find-the-frog-hidden-objects.html)
- [CATEGORY ANIMAL216](https://themindplays.pages.dev/category-animal216.html)
- [HORROR PLAYTIME ROOM ESCAPE](https://thelearnquester.web.app/horror-playtime-room-escape.html)
- [CATEGORY SURVIVAL](https://themindzone.pages.dev/category-survival.html)
- [CATEGORY MEME BLOXY24](https://themindplay.github.io/category-meme-bloxy24.html)
- [HUNTER UNDERWATER SPEARFISHING](https://iskillquest.pages.dev/hunter-underwater-spearfishing.html)
- [CATEGORY DRESS UP](https://learnquester.pages.dev/category-dress-up.html)
- [ZOMBIE ROYALE IO](https://quizverses.github.io/zombie-royale-io.html)
- [CATEGORY FASHION105](https://themindplaying.web.app/category-fashion105.html)
- [STEAL BRAINROT ARENA](https://iskillquest.pages.dev/steal-brainrot-arena.html)
- [CATEGORY CRASH32](https://theskillquest.pages.dev/category-crash32.html)
- [GOLD MINER TOWER DEFENSE](https://thelearnquester.web.app/gold-miner-tower-defense.html)
- [COLLECT HONEY PUZZLE](https://thelearnquester.web.app/collect-honey-puzzle.html)
- [CONTACT](https://thequizzone.pages.dev/contact.html)
- [CATEGORY BRAIN](https://learnquester.pages.dev/category-brain.html)
- [CATEGORY CASUAL 5](https://learnquester.pages.dev/category-casual-5.html)
- [I8 CITY DRIVER](https://theskillquest.pages.dev/i8-city-driver.html)
- [TAP GALLERY](https://themindplay.pages.dev/tap-gallery.html)
- [CATEGORY BIKE](https://quizverses-9d2f2.web.app/category-bike.html)
- [FALLLING JEWELS](https://quizverses.github.io/fallling-jewels.html)
- [SOLITAIRE KLONDIKE ETERNAL RUSSIAN CLASSIC](https://thelearnquesters.pages.dev/solitaire-klondike-eternal-russian-classic.html)
- [FUTURE WAR BOT BATTLE IN SPACE 3D](https://themindzone.pages.dev/future-war-bot-battle-in-space-3d.html)
- [CATEGORY GUN238](https://thequizzone.pages.dev/category-gun238.html)
- [ZOO RESTAURANT](https://themindplay.pages.dev/zoo-restaurant.html)
- [CATEGORY OBSTACLE299](https://quizverses.github.io/category-obstacle299.html)
- [SLIDE BLOCK PUZZLE](https://iskillquest.pages.dev/slide-block-puzzle.html)
- [SLIME FARM](https://theskillquest.pages.dev/slime-farm.html)
- [BULLET SUPERHERO](https://quizverses.github.io/bullet-superhero.html)
- [TRAIN DRIFT](https://thequizzone.pages.dev/train-drift.html)
- [TAIL GUN CHARLIE](https://iskillquest.pages.dev/tail-gun-charlie.html)
- [PUZZLE ABOUT ORANGE](https://themindplaying.web.app/puzzle-about-orange.html)
- [GUNS BOTTLES](https://theskillquest.pages.dev/guns-bottles.html)
- [FIERCE BATTLE BREAKOUT](https://thelearnquester.web.app/fierce-battle-breakout.html)
- [POLICE STATION](https://thequizzone.pages.dev/police-station.html)
- [THE TRENDY MERMAID](https://iskillquest.pages.dev/the-trendy-mermaid.html)
- [AMAZING AIRPLANE RACER](https://iskillquest.pages.dev/amazing-airplane-racer.html)
- [SUPER ONION BOY 2](https://theskillquest.pages.dev/super-onion-boy-2.html)
- [ITALIAN BRAINROT QUIZ](https://thequizzone.pages.dev/italian-brainrot-quiz.html)
- [CATEGORY MERGE](https://quizverses-9d2f2.web.app/category-merge.html)
- [BOOM LAND LITE](https://thelearnquesters.pages.dev/boom-land-lite.html)
- [CATEGORY MINING75](https://themindzone.pages.dev/category-mining75.html)
- [BURGER CATCH](https://iskillquest.pages.dev/burger-catch.html)
- [FARM BLOCK](https://themindzone.pages.dev/farm-block.html)
- [CATEGORY IDLE448](https://themindplay.github.io/category-idle448.html)
- [SKINFLUENCER BEAUTY ROUTINE](https://thelearnquester.web.app/skinfluencer-beauty-routine.html)
- [4 HEXA](https://themindplaying.web.app/4-hexa.html)
- [ZOMBIE HORDE BUILD SURVIVE](https://thequizzone.pages.dev/zombie-horde-build-survive.html)
- [BUBBLE SHOOTER NEON](https://themindzone.pages.dev/bubble-shooter-neon.html)
- [CATEGORY MONSTER207](https://themindplay.github.io/category-monster207.html)
- [CATEGORY MONSTER206](https://theskillquest.pages.dev/category-monster206.html)
- [CATEGORY CASUAL 15](https://theskillquest.pages.dev/category-casual-15.html)
- [CATEGORY MINECRAFT 2](https://themindplay.github.io/category-minecraft-2.html)
- [CATEGORY COLLECT566](https://themindzone.pages.dev/category-collect566.html)
- [CATEGORY UNBLOCKED WEBSITES](https://quizverses-9d2f2.web.app/category-unblocked-websites.html)
- [STUMBLE GUYS](https://quizverses-9d2f2.web.app/stumble-guys.html)
- [OBBY CLIMB RACING](https://thelearnquester.web.app/obby-climb-racing.html)
- [WORD SEARCH UNIVERSE 2](https://themindzone.pages.dev/word-search-universe-2.html)
- [STICKMAN RAGDOLL PLAYGROUND](https://quizverses-9d2f2.web.app/stickman-ragdoll-playground.html)
- [STACK N SORT](https://thelearnquester.web.app/stack-n-sort.html)
- [ANIME COUPLE AVATAR MAKER](https://iskillquest.pages.dev/anime-couple-avatar-maker.html)
- [HAIR SALON BEAUTY SALON](https://thequizzone.pages.dev/hair-salon-beauty-salon.html)
- [CATEGORY THINKY](https://theskillquest.pages.dev/category-thinky.html)
- [IDLE PIZZA BUSINESS](https://quizverses.github.io/idle-pizza-business.html)
- [WORDS FROM WORDS SEA](https://quizverses.github.io/words-from-words-sea.html)
- [BULLET SUPERHERO](https://thelearnquester.web.app/bullet-superhero.html)
- [CATEGORY ADVENTURE 2](https://studyquests.github.io/category-adventure-2.html)
- [CATEGORY HORROR90](https://learnquester.pages.dev/category-horror90.html)
- [CATEGORY FREE](https://themindplays.pages.dev/category-free.html)
- [CATEGORY MAGIC46](https://learnquester.pages.dev/category-magic46.html)
- [CATEGORY CASUAL 12](https://quizverses.github.io/category-casual-12.html)
- [TOILET PIN](https://thequizzone.pages.dev/toilet-pin.html)
- [FORMULA RACING GAMES CAR GAME](https://quizverses.pages.dev/formula-racing-games-car-game.html)
- [SANTA VS SKRITCH](https://thequizzone.pages.dev/santa-vs-skritch.html)
- [MAHJONG STACK](https://thelearnquesters.pages.dev/mahjong-stack.html)
- [ITALIAN BRAINROT TUNG TUNG RACING](https://thelearnquester.web.app/italian-brainrot-tung-tung-racing.html)
- [MAGIC TOWERS SOLITAIRE](https://thelearnquester.web.app/magic-towers-solitaire.html)
- [CATEGORY HORDE SURVIVAL67](https://learnquester.pages.dev/category-horde-survival67.html)
- [LINGO DREAMS](https://thelearnquester.web.app/lingo-dreams.html)
- [BANK ROBBERY ESCAPE](https://quizverses.github.io/bank-robbery-escape.html)
- [MAHJONG CONNECT GOLD](https://thequizzone.pages.dev/mahjong-connect-gold.html)
- [CATEGORY CASUAL 4](https://quizverses.github.io/category-casual-4.html)
- [ITALIAN BRAINROT FIND THE STARS](https://quizverses.github.io/italian-brainrot-find-the-stars.html)
- [SPACE PIN MASTER PULL PIN PUZZLE](https://quizverses.github.io/space-pin-master-pull-pin-puzzle.html)
- [MAHJONG CLASSIC WEBGL](https://thelearnquester.web.app/mahjong-classic-webgl.html)
- [KOKO LOCO BLOCK BLAST](https://quizverses.github.io/koko-loco-block-blast.html)
- [CATEGORY PUZZLE 10](https://theskillquest.pages.dev/category-puzzle-10.html)
- [STICKMAN DUO ESCAPE THE TOMB](https://thelearnquester.web.app/stickman-duo-escape-the-tomb.html)
- [DRAW CLIMB RACE THE ULTIMATE HILL CLIMBING CHALLENGE](https://iskillquest.pages.dev/draw-climb-race-the-ultimate-hill-climbing-challenge.html)
- [SOKOBAN PUSH THE BOX](https://thelearnquesters.pages.dev/sokoban-push-the-box.html)
- [PIZZA MAKER COOKING GAMES FOR KIDS](https://iskillquest.pages.dev/pizza-maker-cooking-games-for-kids.html)
- [CATEGORY UNBLOCKED WEBSITE](https://quizverses-9d2f2.web.app/category-unblocked-website.html)
- [CATEGORY MISSION207](https://quizverses-9d2f2.web.app/category-mission207.html)
