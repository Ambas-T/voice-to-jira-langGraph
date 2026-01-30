/**
 * LangGraph nodes for the Jira story workflow.
 * Each node receives full state and returns a partial state update.
 */
import type { JiraAgentState } from "./state.js";
import { generateStory, generateSubtasks } from "./services/story-generation.js";
import { createJiraStory } from "./services/jira-client.js";

export async function generateStoryNode(
  state: JiraAgentState
): Promise<Partial<JiraAgentState>> {
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
  if (!state.title || !state.description || !state.acceptanceCriteria) {
    return { error: "Missing story content to format" };
  }
  return {
    humanApproval: "pending",
    messages: [{ role: "system", content: "Story ready for approval" }],
  };
}

/** Populates state.subtasks (3–5 items); graph then fans out via Send(create_jira) × N. */
export async function generateSubtasksNode(
  state: JiraAgentState
): Promise<Partial<JiraAgentState>> {
  if (!state.title || !state.description || !state.acceptanceCriteria) {
    return { error: "Missing story content to generate subtasks" };
  }
  const result = await generateSubtasks({
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
  return {
    subtasks: result.subtasks,
    messages: [
      {
        role: "system",
        content: `Generated ${result.subtasks.length} subtasks`,
      },
    ],
  };
}

export async function humanApprovalNode(
  state: JiraAgentState
): Promise<Partial<JiraAgentState>> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const answer = await new Promise<string>((resolve) => {
    rl.question("Approve this story? (y/n): ", (input) => {
      rl.close();
      resolve(input.trim().toLowerCase());
    });
  });

  if (answer === "yes" || answer === "y") {
    return {
      humanApproval: "approved",
      messages: [{ role: "human", content: "Approved" }],
    };
  }
  return {
    humanApproval: "rejected",
    messages: [{ role: "human", content: "Rejected" }],
  };
}

export async function createJiraNode(
  state: JiraAgentState
): Promise<Partial<JiraAgentState>> {
  if (!state.title || !state.description || !state.acceptanceCriteria) {
    return { error: "Missing story content" };
  }

  // If parentKey is set, this is a subtask creation (child of parent story)
  const optionalFields = state.parentKey
    ? { parentKey: state.parentKey }
    : undefined;

  const result = await createJiraStory({
    title: state.title,
    description: state.description,
    acceptanceCriteria: state.acceptanceCriteria,
    optionalFields,
  });

  if (!result.ok) {
    return {
      error: result.error,
      messages: [{ role: "error", content: result.error }],
    };
  }

  const issue = {
    jiraKey: result.result.jiraKey,
    jiraUrl: result.result.jiraUrl,
  };
  return {
    jiraKey: issue.jiraKey,
    jiraUrl: issue.jiraUrl,
    createdSubtaskIssues: [issue],
    messages: [
      { role: "system", content: `Jira ${state.parentKey ? "subtask" : "story"} created: ${issue.jiraKey}` },
    ],
  };
}
