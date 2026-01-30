/**
 * LangGraph Jira workflow: state, nodes, graph, and services.
 *
 * Two core LangGraph components:
 * - State: state.ts (schema, channels, reducers)
 * - Graph: graph.ts + nodes.ts (workflow definition and node logic)
 *
 * Services (story-generation, jira-client) are used by nodes and by the API.
 */
import type { JiraAgentState } from "./state.js";
export { jiraStateChannels } from "./state.js";
export type {
  JiraAgentState,
  GeneratedStory,
  CreateJiraPayload,
  CreateJiraResult,
  JiraOptionalFields,
  SubtaskItem,
  CreatedSubtaskIssue,
} from "./state.js";

import { createJiraGraph, createSubtaskGraph } from "./graph.js";

export { createJiraGraph, createSubtaskGraph } from "./graph.js";

/**
 * Run the subtask graph: generate N subtasks from story → Pregel runs create_jira N times.
 * Each subtask is linked to the parentKey as a Jira sub-task.
 * Returns the aggregated createdSubtaskIssues from the channel reducer.
 */
export async function createSubtasksFromStory(story: {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  parentKey: string;
}): Promise<
  | { ok: true; createdSubtaskIssues: Array<{ jiraKey: string; jiraUrl: string }> }
  | { ok: false; error: string }
> {
  const graph = createSubtaskGraph();
  const initialState: JiraAgentState = {
    topic: "",
    title: story.title,
    description: story.description,
    acceptanceCriteria: story.acceptanceCriteria,
    parentKey: story.parentKey,
    messages: [],
  };
  const config = { configurable: { thread_id: `subtasks-${Date.now()}` } };
  try {
    const result = (await graph.invoke(initialState, config)) as JiraAgentState;
    if (result.error) {
      return { ok: false, error: result.error };
    }
    const issues = result.createdSubtaskIssues ?? [];
    return { ok: true, createdSubtaskIssues: issues };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Compiled graph instance for LangGraph CLI (`langgraph dev`). */
export const graph = createJiraGraph();

export { generateStory, createJiraStory, getIssueTypeId } from "./services/index.js";
