/**
 * LangGraph definition: build and compile the Jira story workflow.
 * Composes state (channels) and nodes into a StateGraph with edges and checkpointing.
 */
import { StateGraph, END, START } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { jiraStateChannels } from "./state.js";
import {
  generateStoryNode,
  formatPreviewNode,
  humanApprovalNode,
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
