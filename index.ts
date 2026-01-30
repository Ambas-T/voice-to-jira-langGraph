import * as dotenv from "dotenv";
dotenv.config();

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGroq } from "@langchain/groq";
import { createAgent } from "langchain";
import { TavilySearch } from "@langchain/tavily";

// 1.1. Model - Gemini model
const googleModel = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 1,
  apiKey: process.env.GOOGLE_API_KEY!,
});

// 1.2. Model - OpenAI model
const openaiModel = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 1,
  apiKey: process.env.OPENAI_API_KEY!,
});

// 1.3. Model - Groq model
const groqModel = new ChatGroq({
  model: "llama3-3.1-8b-instant",
  temperature: 1,
  apiKey: process.env.GROQ_API_KEY!,
});


// 2. Tools: Real Tavily tool setup
const searchTool = new TavilySearch({
  maxResults: 3,
});


// 3. Agent: Create the agent
const agent = createAgent({
  model: googleModel,
  tools: [searchTool],
  // 4: System Prompt
  systemPrompt: `You are a real-time assistant with full access to web search via the Tavily tool.
For ANY question involving:
- current weather
- today's conditions
- live or recent information
- anything that requires up-to-date facts

YOU MUST ALWAYS call the search tool FIRST before answering.
NEVER say "I cannot provide live weather" or "I don't have real-time access" — use the tool instead.
Search aggressively for current Dallas weather when asked.
Always provide the most recent information available from search results.`,
});

// 5. Demo function with nice output
async function runDemo() {
  const query = "What is the weather today in Dallas?";

  console.log("\n┌──────────────────────────────┐");
  console.log("│          QUERY                 │");
  console.log("└──────────────────────────────--┘");
  console.log(query);

  try {
    const result = await agent.invoke({
      messages: [{ role: "user", content: query }],
    });

    const finalMessage = result.messages[result.messages.length - 1];
    const answer = finalMessage?.content ?? "No answer received";

    console.log("\n┌──────────────────────────────┐");
    console.log("│     AGENT FINAL ANSWER       │");
    console.log("└──────────────────────────────┘");
    console.log(answer);
    console.log("══════════════════════════════\n");
  } catch (error) {
    console.error(
      "Demo failed:",
      error instanceof Error ? error.message : error
    );
  }
}

runDemo();
