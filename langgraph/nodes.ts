/**
 * LangGraph nodes for the Jira story workflow.
 * Each node receives full state and returns a partial state update.
 */
import type { JiraAgentState } from "./state.js";
import { generateStory } from "./services/story-generation.js";
import { createJiraStory } from "./services/jira-client.js";

const JIRA_DOMAIN = process.env.JIRA_DOMAIN ?? "";
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY ?? "PROJ";

export async function generateStoryNode(
  state: JiraAgentState
): Promise<Partial<JiraAgentState>> {
  console.log(`\n🤖 [Node: Generate Story] Processing topic: "${state.topic}"...`);

  const result = await generateStory(state.topic);
  if (!result.ok) {
    return {
      error: result.error,
      messages: [{ role: "error", content: result.error }],
    };
  }
  const { story } = result;
  return {
    title: story.title,
    description: story.description,
    acceptanceCriteria: story.acceptanceCriteria,
    messages: [{ role: "system", content: `Generated story: ${story.title}` }],
  };
}

export async function formatPreviewNode(
  state: JiraAgentState
): Promise<Partial<JiraAgentState>> {
  console.log("\n📋 [Node: Format Preview] Formatting story for review...");

  if (!state.title || !state.description || !state.acceptanceCriteria) {
    return { error: "Missing story content to format" };
  }

  const preview = `
╔═══════════════════════════════════════════════════════════╗
║                    JIRA STORY PREVIEW                      ║
╚═══════════════════════════════════════════════════════════╝

📌 TITLE:
${state.title}

📄 DESCRIPTION:
${state.description}

✅ ACCEPTANCE CRITERIA:
${state.acceptanceCriteria.map((c, i) => `   ${i + 1}. ${c}`).join("\n")}

╔═══════════════════════════════════════════════════════════╗
║  This story will be created in:                           ║
║  Project: ${JIRA_PROJECT_KEY.padEnd(47)} ║
║  Domain: ${JIRA_DOMAIN}.atlassian.net${" ".repeat(27)} ║
╚═══════════════════════════════════════════════════════════╝
`;

  return {
    formattedPreview: preview,
    humanApproval: "pending",
    messages: [{ role: "system", content: "Story formatted and ready for approval" }],
  };
}

export async function humanApprovalNode(
  state: JiraAgentState
): Promise<Partial<JiraAgentState>> {
  console.log("\n👤 [Node: Human Approval] Waiting for your decision...");
  console.log(state.formattedPreview);

  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const answer = await new Promise<string>((resolve) => {
    rl.question(
      "\n❓ Approve this story? (yes/y to approve, no/n to reject, edit/e to modify): ",
      (input) => {
        rl.close();
        resolve(input.trim().toLowerCase());
      }
    );
  });

  if (answer === "yes" || answer === "y") {
    console.log("✅ Approval granted! Proceeding to create Jira story...");
    return {
      humanApproval: "approved",
      messages: [{ role: "human", content: "Approved" }],
    };
  }
  if (answer === "no" || answer === "n") {
    console.log("❌ Approval rejected. Story will not be created.");
    return {
      humanApproval: "rejected",
      messages: [{ role: "human", content: "Rejected" }],
    };
  }
  console.log("⚠️  Unrecognized response. Treating as rejection.");
  return {
    humanApproval: "rejected",
    messages: [{ role: "human", content: `Unrecognized: ${answer}` }],
  };
}

export async function createJiraNode(
  state: JiraAgentState
): Promise<Partial<JiraAgentState>> {
  console.log("\n📝 [Node: Create Jira] Creating story in Jira...");

  if (!state.title || !state.description || !state.acceptanceCriteria) {
    return { error: "Missing story content" };
  }

  const result = await createJiraStory({
    title: state.title,
    description: state.description,
    acceptanceCriteria: state.acceptanceCriteria,
  });

  if (!result.ok) {
    return {
      error: result.error,
      messages: [{ role: "error", content: result.error }],
    };
  }

  console.log(`\n✅ Story created: ${result.result.jiraKey}`);
  return {
    jiraKey: result.result.jiraKey,
    jiraUrl: result.result.jiraUrl,
    messages: [
      { role: "system", content: `Jira story created: ${result.result.jiraKey}` },
    ],
  };
}
