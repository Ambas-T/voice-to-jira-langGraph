// jira-agent.ts - LangGraph Jira story workflow (CLI entry).
// Uses langgraph/ (state + graph + nodes + services). UI uses the API; this runs the graph for CLI.
import * as dotenv from "dotenv";
dotenv.config();

import { createJiraGraph, type JiraAgentState } from "./langgraph/index.js";

const JIRA_DOMAIN = process.env.JIRA_DOMAIN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

if (!JIRA_DOMAIN) throw new Error("Missing JIRA_DOMAIN");
if (!JIRA_PROJECT_KEY) throw new Error("Missing JIRA_PROJECT_KEY");

async function main() {
  const topic = process.argv[2];
  let userTopic = topic;

  if (!userTopic) {
    const readline = await import("node:readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    userTopic = await new Promise<string>((resolve) => {
      rl.question("Topic for Jira story: ", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });

    if (!userTopic) {
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
    const result = (await graph.invoke(initialState, config)) as JiraAgentState;

    if (result.error) {
      process.stderr.write(`Error: ${result.error}\n`);
      process.exit(1);
    }

    if (result.humanApproval === "rejected") {
      process.exit(0);
    }

    if (result.jiraKey && result.jiraUrl) {
      process.stdout.write(`${result.jiraKey} ${result.jiraUrl}\n`);
    }
  } catch (err) {
    process.stderr.write(
      `Fatal: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
