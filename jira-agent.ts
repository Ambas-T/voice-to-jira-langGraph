// jira-agent.ts - LangGraph-based Jira Story Creator with Human-in-the-Loop
import * as dotenv from "dotenv";
dotenv.config();

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StateGraph, END, START } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";

// ── Configuration ────────────────────────────────────────────────────────
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_DOMAIN = process.env.JIRA_DOMAIN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

if (!GOOGLE_API_KEY) throw new Error("Missing GOOGLE_API_KEY");
if (!JIRA_EMAIL) throw new Error("Missing JIRA_EMAIL");
if (!JIRA_API_TOKEN) throw new Error("Missing JIRA_API_TOKEN");
if (!JIRA_DOMAIN) throw new Error("Missing JIRA_DOMAIN");
if (!JIRA_PROJECT_KEY) throw new Error("Missing JIRA_PROJECT_KEY");

const JIRA_BASE_URL = `https://${JIRA_DOMAIN}.atlassian.net`;

// ── LLM ──────────────────────────────────────────────────────────────────
const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.7,
  maxOutputTokens: 4096,
  apiKey: GOOGLE_API_KEY,
});

// ── State Schema (Reducer) ─────────────────────────────────────────────────
interface JiraAgentState {
  topic: string;
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
  formattedPreview?: string;
  humanApproval?: "approved" | "rejected" | "pending";
  jiraKey?: string;
  jiraUrl?: string;
  error?: string;
  messages: Array<{ role: string; content: string }>;
}

// ── State Reducer ────────────────────────────────────────────────────────
const reducer = (current: JiraAgentState, update: Partial<JiraAgentState>): JiraAgentState => {
  return {
    ...current,
    ...update,
    messages: [...(current.messages || []), ...(update.messages || [])],
  };
};

// ── Node 1: Generate Story Content ───────────────────────────────────────
async function generateStoryNode(state: JiraAgentState): Promise<Partial<JiraAgentState>> {
  console.log(`\n🤖 [Node: Generate Story] Processing topic: "${state.topic}"...`);

  const prompt = `You are a professional Product Manager creating a Jira story.

The user wants a story about: "${state.topic}"

Create a well-structured Jira story with:

1. **Title** (Summary): A clear, concise story title (max 100 characters)
   - Use action-oriented language
   - Focus on the user value or feature
   - Example: "As a user, I want to filter search results by date"

2. **Description**: A detailed description (2-4 paragraphs) that includes:
   - User story format: "As a [user type], I want [goal] so that [benefit]"
   - Context and background
   - Technical considerations (if relevant)
   - Dependencies or related work

3. **Acceptance Criteria**: A list of 3-6 specific, testable criteria
   - Each criterion should be clear and measurable
   - Format: "Given [condition], when [action], then [result]"

Respond in this exact JSON format:
{
  "title": "Story title here",
  "description": "Full description with user story format and details",
  "acceptanceCriteria": [
    "Criterion 1",
    "Criterion 2",
    "Criterion 3"
  ]
}

Make it professional, clear, and actionable.`;

  try {
    const response = await llm.invoke(prompt);
    const content = response.content as string;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse LLM response as JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      title: parsed.title || `Story: ${state.topic}`,
      description: parsed.description || `Story about ${state.topic}`,
      acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria)
        ? parsed.acceptanceCriteria
        : [parsed.acceptanceCriteria || "Story is complete"].filter(Boolean),
      messages: [
        {
          role: "system",
          content: `Generated story: ${parsed.title}`,
        },
      ],
    };
  } catch (err) {
    return {
      error: `Failed to generate story: ${err instanceof Error ? err.message : String(err)}`,
      messages: [
        {
          role: "error",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
}

// ── Node 2: Format Preview ──────────────────────────────────────────────
async function formatPreviewNode(state: JiraAgentState): Promise<Partial<JiraAgentState>> {
  console.log("\n📋 [Node: Format Preview] Formatting story for review...");

  if (!state.title || !state.description || !state.acceptanceCriteria) {
    return {
      error: "Missing story content to format",
    };
  }

  const projectKey = JIRA_PROJECT_KEY || "PROJ";
  const preview = `
╔═══════════════════════════════════════════════════════════╗
║                    JIRA STORY PREVIEW                      ║
╚═══════════════════════════════════════════════════════════╝

📌 TITLE:
${state.title}

📄 DESCRIPTION:
${state.description}

✅ ACCEPTANCE CRITERIA:
${state.acceptanceCriteria.map((criteria, idx) => `   ${idx + 1}. ${criteria}`).join("\n")}

╔═══════════════════════════════════════════════════════════╗
║  This story will be created in:                           ║
║  Project: ${projectKey.padEnd(47)} ║
║  Domain: ${JIRA_DOMAIN}.atlassian.net${" ".repeat(27)} ║
╚═══════════════════════════════════════════════════════════╝
`;

  return {
    formattedPreview: preview,
    humanApproval: "pending",
    messages: [
      {
        role: "system",
        content: "Story formatted and ready for approval",
      },
    ],
  };
}

// ── Node 3: Human Approval (Interrupt) ──────────────────────────────────
async function humanApprovalNode(state: JiraAgentState): Promise<Partial<JiraAgentState>> {
  console.log("\n👤 [Node: Human Approval] Waiting for your decision...");
  console.log(state.formattedPreview);

  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const answer = await new Promise<string>((resolve) => {
    rl.question("\n❓ Approve this story? (yes/y to approve, no/n to reject, edit/e to modify): ", (input) => {
      rl.close();
      resolve(input.trim().toLowerCase());
    });
  });

  if (answer === "yes" || answer === "y") {
    console.log("✅ Approval granted! Proceeding to create Jira story...");
    return {
      humanApproval: "approved",
      messages: [
        {
          role: "human",
          content: "Approved",
        },
      ],
    };
  } else if (answer === "no" || answer === "n") {
    console.log("❌ Approval rejected. Story will not be created.");
    return {
      humanApproval: "rejected",
      messages: [
        {
          role: "human",
          content: "Rejected",
        },
      ],
    };
  } else {
    // For "edit" or other responses, we could add a loop back to generation
    console.log("⚠️  Unrecognized response. Treating as rejection.");
    return {
      humanApproval: "rejected",
      messages: [
        {
          role: "human",
          content: `Unrecognized: ${answer}`,
        },
      ],
    };
  }
}

// ── Node 4: Create Jira Story ───────────────────────────────────────────
async function createJiraNode(state: JiraAgentState): Promise<Partial<JiraAgentState>> {
  console.log("\n📝 [Node: Create Jira] Creating story in Jira...");

  if (!state.title || !state.description || !state.acceptanceCriteria) {
    return {
      error: "Missing story content",
    };
  }

  try {
    // Get issue type
    const issueTypeId = await getIssueTypes();

    // Format description with ADF
    const descriptionParagraphs = state.description.split("\n\n").filter((p) => p.trim());
    const descriptionContent: any[] = [];

    descriptionParagraphs.forEach((para) => {
      descriptionContent.push({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: para.trim(),
          },
        ],
      });
    });

    descriptionContent.push({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Acceptance Criteria:",
          marks: [{ type: "strong" }],
        },
      ],
    });

    state.acceptanceCriteria.forEach((criteria) => {
      descriptionContent.push({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `☐ ${criteria}`,
          },
        ],
      });
    });

    const issueData = {
      fields: {
        project: { key: JIRA_PROJECT_KEY },
        summary: state.title,
        description: {
          type: "doc",
          version: 1,
          content: descriptionContent,
        },
        issuetype: { id: issueTypeId },
      },
    };

    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

    const response = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(issueData),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Jira API error: ${error}`);
    }

    const result = (await response.json()) as { key: string; id: string };
    const storyUrl = `${JIRA_BASE_URL}/browse/${result.key}`;

    console.log(`\n✅ Story created: ${result.key}`);

    return {
      jiraKey: result.key,
      jiraUrl: storyUrl,
      messages: [
        {
          role: "system",
          content: `Jira story created: ${result.key}`,
        },
      ],
    };
  } catch (err) {
    return {
      error: `Failed to create Jira story: ${err instanceof Error ? err.message : String(err)}`,
      messages: [
        {
          role: "error",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
}

// ── Helper: Get Issue Types ─────────────────────────────────────────────
async function getIssueTypes(): Promise<string> {
  try {
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
    const response = await fetch(`${JIRA_BASE_URL}/rest/api/3/project/${JIRA_PROJECT_KEY}`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return "10001"; // Default Story type
    }

    const project = (await response.json()) as {
      issueTypes?: Array<{ name: string; id: string; subtask?: boolean }>;
    };
    
    if (project.issueTypes) {
      // Filter out sub-tasks explicitly - sub-tasks require a parent issue
      const nonSubtaskTypes = project.issueTypes.filter(
        (it) => !it.subtask && !it.name.toLowerCase().includes("sub")
      );
      
      // Prefer "Story" (exact match, case-insensitive)
      const storyType = nonSubtaskTypes.find((it) => it.name.toLowerCase() === "story");
      if (storyType) return storyType.id;

      // Then try "Task" (exact match, case-insensitive)
      const taskType = nonSubtaskTypes.find((it) => it.name.toLowerCase() === "task");
      if (taskType) return taskType.id;

      // Fallback: any non-sub-task type that includes "story" or "task" in the name
      const storyOrTaskType = nonSubtaskTypes.find(
        (it) => it.name.toLowerCase().includes("story") || it.name.toLowerCase().includes("task")
      );
      if (storyOrTaskType) return storyOrTaskType.id;

      // Last resort: use the first non-sub-task type
      const firstType = nonSubtaskTypes[0];
      if (firstType) {
        return firstType.id;
      }
    }

    return "10001"; // Default Story type
  } catch (err) {
    return "10001";
  }
}


// ── Build LangGraph ─────────────────────────────────────────────────────
function createJiraGraph() {
  // StateGraph with state schema using channels/reducers pattern
  // Each channel defines how state updates are merged
  const workflow = new StateGraph({
    channels: {
      topic: { reducer: (x: string | undefined, y: string | undefined) => y ?? x ?? "" },
      title: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
      description: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
      acceptanceCriteria: { reducer: (x: string[] | undefined, y: string[] | undefined) => y ?? x },
      formattedPreview: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
      humanApproval: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
      jiraKey: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
      jiraUrl: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
      error: { reducer: (x: string | undefined, y: string | undefined) => y ?? x },
      messages: { reducer: (x: any[] | undefined, y: any[] | undefined) => [...(x || []), ...(y || [])] },
    },
  } as any);

  // Add nodes - each node receives full state, returns partial update
  workflow.addNode("generate_story", generateStoryNode as any);
  workflow.addNode("format_preview", formatPreviewNode as any);
  workflow.addNode("human_approval", humanApprovalNode as any);
  workflow.addNode("create_jira", createJiraNode as any);

  // Static edges: define the flow
  workflow.addEdge(START, "generate_story" as any);
  workflow.addEdge("generate_story" as any, "format_preview" as any);
  workflow.addEdge("format_preview" as any, "human_approval" as any);

  // Conditional edge: route based on human approval decision
  workflow.addConditionalEdges("human_approval" as any, (state: any) => {
    if (state.humanApproval === "approved") return "create_jira";
    if (state.humanApproval === "rejected") return END;
    return "human_approval"; // Loop back if still pending
  });

  // Terminal edge: end after creating Jira story
  workflow.addEdge("create_jira" as any, END);

  // Checkpointing: enables state persistence and human-in-the-loop interrupts
  const checkpointer = new MemorySaver();
  const app = workflow.compile({ checkpointer });

  return app;
}

// ── Main Flow ────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║     📋 JIRA STORY CREATOR (LangGraph + Human-in-Loop)     ║");
  console.log("║     Topic → Generate → Review → Approve → Create          ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  console.log(`🔗 Jira Domain: ${JIRA_DOMAIN}.atlassian.net`);
  console.log(`📁 Project: ${JIRA_PROJECT_KEY}\n`);

  // Get topic
  const topic = process.argv[2];
  let userTopic = topic;

  if (!userTopic) {
    const readline = await import("node:readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    userTopic = await new Promise<string>((resolve) => {
      rl.question("💬 What Jira story do you want to create? (Enter topic): ", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });

    if (!userTopic) {
      console.error("❌ No topic provided. Exiting.");
      process.exit(1);
    }
  }

  // Initialize state
  const initialState: JiraAgentState = {
    topic: userTopic,
    messages: [],
  };

  // Create and run graph
  const graph = createJiraGraph();
  const config = { configurable: { thread_id: `jira-${Date.now()}` } };

  try {
    console.log("\n🚀 Starting LangGraph workflow...\n");

    // Run the graph (it will interrupt at human_approval node)
    const result = await graph.invoke(initialState, config);

    // Check final state
    if (result.error) {
      console.error("\n❌ Error:", result.error);
      process.exit(1);
    }

    if (result.humanApproval === "rejected") {
      console.log("\n⚠️  Story creation cancelled by user.");
      process.exit(0);
    }

    if (result.jiraKey && result.jiraUrl) {
      console.log("\n✅ ════════════════════════════════════════════════════════");
      console.log(`   JIRA STORY CREATED SUCCESSFULLY!`);
      console.log(`   🔑 Story Key: ${result.jiraKey}`);
      console.log(`   🔗 URL: ${result.jiraUrl}`);
      console.log(`   📌 Title: ${result.title}`);
      console.log("════════════════════════════════════════════════════════════\n");
    }
  } catch (err) {
    console.error("\n❌ Fatal error:", err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) {
      console.error("Stack:", err.stack);
    }
    process.exit(1);
  }
}

// ── Run ──────────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message || err);
  process.exit(1);
});
