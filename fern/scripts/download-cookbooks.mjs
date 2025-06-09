import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, "cookbooks-json");
await fs.mkdir(outputDir, { recursive: true });

const pages = [
  "/page/calendar-agent",
  "/page/basic-tool-use",
  "/page/basic-multi-step",
  "/page/data-analyst-agent",
  "/page/agent-short-term-memory",
  "/page/agent-api-calls",
  "/page/csv-agent",
  "/page/agentic-rag-mixed-data",
  "/page/sql-agent",
  "/page/csv-agent-native-api",
  "/page/pdf-extractor",
  "/page/agentic-multi-stage-rag",
  "/page/basic-multi-step",
  "/page/data-analyst-agent",
  "/page/csv-agent",
  "/page/multilingual-search",
  "/page/creating-a-qa-bot",
  "/page/wikipedia-semantic-search",
  "/page/embed-jobs-serverless-pinecone",
  "/page/elasticsearch-and-cohere",
  "/page/embed-jobs",
  "/page/basic-semantic-search",
  "/page/multilingual-search",
  "/page/wikipedia-search-with-weaviate",
  "/page/creating-a-qa-bot",
  "/page/rerank-demo",
  "/page/embed-jobs-serverless-pinecone",
  "/page/elasticsearch-and-cohere",
  "/page/basic-rag",
  "/page/elasticsearch-and-cohere",
  "/page/chunking-strategies",
  "/page/migrating-prompts",
  "/page/rag-with-chat-embed",
  "/page/creating-a-qa-bot",
  "/page/rag-evaluation-deep-dive",
  "/page/analysis-of-financial-forms",
  "/page/long-form-general-strategies",
  "/page/summarization-evals",
  "/page/grounded-summarization",
  "/page/fueling-generative-content",
  "/page/text-classification-using-embeddings",
  "/page/article-recommender-with-text-embeddings",
  "/page/document-parsing-for-enterprises",
  "/page/pondr",
  "/page/hello-world-meet-ai",
  "/page/topic-modeling-ai-papers",
  "/page/analyzing-hacker-news",
];

async function downloadCookbooks(pages) {
  try {
    for (const page of pages) {
      try {
        const response = await fetch(`https://docs.cohere.com${page}?json=on`, {
          method: "GET",
          redirect: "follow",
          headers: {
            accept: "application/json",
            cookie: `connect.sid=${process.env.README_SESSION_ID}`,
            "x-requested-with": "XMLHttpRequest",
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch ${page}: ${response.statusText}`);
        }

        const data = await response.json();
        const filename = `${page.split("/").pop()}.json`;

        await fs.writeFile(
          path.join(outputDir, filename),
          JSON.stringify(data, null, 2)
        );

        console.log(`Successfully wrote ${filename}`);
      } catch (error) {
        console.error(`Error processing ${page}:`, error);
        break;
      }
    }
  } catch (error) {
    console.error("Error setting up directory or fetching pages:", error);
  }
}

void downloadCookbooks(pages);
