// jira-agent.ts - LangGraph-based Jira Story Creator with Human-in-the-Loop
// Uses langgraph/ (state + graph + nodes + services) for the workflow.
import * as dotenv from "dotenv";
dotenv.config();

import { createJiraGraph, type JiraAgentState } from "./langgraph/index.js";

const JIRA_DOMAIN = process.env.JIRA_DOMAIN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

if (!JIRA_DOMAIN) throw new Error("Missing JIRA_DOMAIN");
if (!JIRA_PROJECT_KEY) throw new Error("Missing JIRA_PROJECT_KEY");

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║     📋 JIRA STORY CREATOR (LangGraph + Human-in-Loop)     ║");
  console.log("║     Topic → Generate → Review → Approve → Create          ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  console.log(`🔗 Jira Domain: ${JIRA_DOMAIN}.atlassian.net`);
  console.log(`📁 Project: ${JIRA_PROJECT_KEY}\n`);

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

  const initialState: JiraAgentState = {
    topic: userTopic,
    messages: [],
  };

  const graph = createJiraGraph();
  const config = { configurable: { thread_id: `jira-${Date.now()}` } };

  try {
    console.log("\n🚀 Starting LangGraph workflow...\n");

    const result = (await graph.invoke(initialState, config)) as JiraAgentState;

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

main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message || err);
  process.exit(1);
});
