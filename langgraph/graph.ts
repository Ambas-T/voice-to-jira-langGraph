/**
 * LangGraph definition: build and compile the Jira story workflow.
 * Composes state (channels) and nodes into a StateGraph with edges and checkpointing.
 */
import { StateGraph, END, START, Send } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { jiraStateChannels } from "./state.js";
import {
  generateStoryNode,
  formatPreviewNode,
  humanApprovalNode,
  generateSubtasksNode,
  createJiraNode,
} from "./nodes.js";

export function createJiraGraph() {
  const workflow = new StateGraph({
    channels: jiraStateChannels,
  } as any);

  workflow.addNode("generate_story", generateStoryNode as any);
  workflow.addNode("format_preview", formatPreviewNode as any);
  workflow.addNode("human_approval", humanApprovalNode as any);
  workflow.addNode("create_jira", createJiraNode as any);

  workflow.addEdge(START, "generate_story" as any);
  workflow.addEdge("generate_story" as any, "format_preview" as any);
  workflow.addEdge("format_preview" as any, "human_approval" as any);

  workflow.addConditionalEdges("human_approval" as any, (state: any) => {
    if (state.humanApproval === "approved") return "create_jira";
    if (state.humanApproval === "rejected") return END;
    return "human_approval";
  });

  workflow.addEdge("create_jira" as any, END);

  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}

/**
 * Subtask graph: one node says "generate N subtasks" → Pregel fans out.
 * START → generate_subtasks → Send(create_jira) × N → create_jira → END.
 * No loop: Pregel sees N Sends and runs create_jira N times; channel reducer concats results.
 */
export function createSubtaskGraph() {
  const workflow = new StateGraph({
    channels: jiraStateChannels,
  } as any);

  workflow.addNode("generate_subtasks", generateSubtasksNode as any);
  workflow.addNode("create_jira", createJiraNode as any);

  workflow.addEdge(START, "generate_subtasks" as any);

  workflow.addConditionalEdges("generate_subtasks" as any, (state: any) => {
    const subtasks = state.subtasks ?? [];
    if (subtasks.length === 0) return END;
    return subtasks.map((st: { title: string; description: string; acceptanceCriteria: string[] }) =>
      new Send("create_jira", {
        ...state,
        title: st.title,
        description: st.description,
        acceptanceCriteria: st.acceptanceCriteria,
      })
    );
  });

  workflow.addEdge("create_jira" as any, END);

  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}
