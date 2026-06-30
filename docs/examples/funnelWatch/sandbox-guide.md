# sandbox (/docs/sandbox)
LLMs are very good at spinning up scripts to do advanced analysis work. Composio's `COMPOSIO_REMOTE_WORKBENCH` + `COMPOSIO_REMOTE_BASH_TOOL` superpower your agent by giving it acccess to a remote environment where it can:

1) write and run python scripts
2) call external APIs and invoke other LLMs as needed
3) use a filesystem + shell to easily store and reference outputs

The sandbox is automatically spun up at the start of a session. You can think of it as a persistent Jupyter notebook. Variables, imports, files, and in-memory state from one call are available in the next. 

It manages dependencies automatically and corrects common mistakes in the code your agent generates. For example, if a script accesses `result["apiKey"]` but the actual field name is `api_key`, the sandbox will resolve the mismatch instead of failing.

## built-in helpers

These functions are pre-initialized in every sandbox, so your agent can call them without any setup:

| Helper               | What it does                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `run_composio_tool`  | Execute any Composio tool (e.g., `GMAIL_SEND_EMAIL`, `SLACK_SEND_MESSAGE`) and get structured results |
| `invoke_llm`         | Call an LLM for classification, summarization, content generation, or data extraction                 |
| `upload_local_file`  | Upload generated files (reports, CSVs, images) to cloud storage and get a download URL                |
| `proxy_execute`      | Make direct API calls to connected services when no pre-built tool exists                             |
| `web_search`         | Search the web and return results for research or data enrichment                                     |
| `smart_file_extract` | Extract text from PDFs, images, and other file formats in the sandbox                                 |


* !! what is the advantage of doing this from within the sandbox as opposed to doing it outside? the sandbox.

# moving files into andout of the sandbox

The sandbox has a persistent filesystem at `/mnt/files/`. Code running in the sandbox reads and writes files there, and the mount survives sandbox restarts: changing the [compute tier](#compute-tier) recreates the sandbox and clears in-memory state, but `/mnt/files/` persists.

The mount exposes [methods](#mount-implementation) to upload, download, list, and delete files in the sandbox. This is especially useful during long-lived agent sessions; you can regularly flush files in the sandbox (such as data retrieved from tool calls) to durable storage.

## allocating compute

A standard sandbox has 1 vCPU and 1 GB RAM. For heavier workloads, you can upgrade to a larger compute tier using `sandbox.sandboxSize` (TypeScript) or `sandbox.sandbox_size` (Python):

* `medium` (2 vCPU, 2 GB)
* `large` (4 vCPU, 4 GB)
* `xlarge` (8 vCPU, 8 GB)

You can also change the compute tier of the sandbox in the middle of a session. This will recreate it, clearing the in-memory state.

# Next

- [What is a session?](/docs/how-composio-works): How sessions scope tools, auth, and sandbox state to a user

---

📚 **More documentation:** [View all docs](https://docs.composio.dev/llms.txt) | [Glossary](https://docs.composio.dev/llms.mdx/reference/glossary) | [Examples](https://docs.composio.dev/llms.mdx/examples) | [API Reference](https://docs.composio.dev/llms.mdx/reference)

---


---