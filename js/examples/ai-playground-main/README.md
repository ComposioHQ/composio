# AI Playground

![AI Playground](.github/ai-playground.png)

> [!WARNING]  
> **This repo is in-progress.** I'll launch it officially soon!

[View the deployed version](https://ai-playground.signalnerve.workers.dev)

This is my example playground for working with AIs/LLMs in [Cloudflare Workers AI](https://ai.cloudflare.com). It might be interesting to other people - or it might not!

It includes some of my most recent best practices for working with generative text AI models in a full-stack context. 

On the backend, that includes:

- Using Hono (particularly the [Hono streaming APIs](https://hono.dev/helpers/streaming))
- Using Workers AI
- **NEW:** Support for function calling

On the frontend, that includes:

- Using [Vue 3](https://vuejs.org), [Tailwind CSS](https://tailwindcss.com), and [daisyUI](https://daisyui.com) for a simple UI
- Basic "chat" flow - persisting old messages in the UI, loading states, and more
- **NEW:** Support for tool/function call results in the UI

This code is open-sourced so that if you're trying to build with Workers AI, you can rip out pieces of it for your own tasks, or even fork it and build something wholesale with it.
