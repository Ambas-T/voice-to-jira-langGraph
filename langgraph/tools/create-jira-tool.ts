/**
 * LangChain tool for creating a Jira story. Used by LangGraph ToolNode.
 */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createJiraStory } from "../services/jira-client.js";

const createJiraStoryTool = tool(
  async ({ title, description, acceptanceCriteria }) => {
    const result = await createJiraStory({
      title,
      description,
      acceptanceCriteria,
    });
    if (!result.ok) {
      return JSON.stringify({ error: result.error });
    }
    return JSON.stringify({
      jiraKey: result.result.jiraKey,
      jiraUrl: result.result.jiraUrl,
    });
  },
  {
    name: "create_jira_story",
    description: "Create a Jira story (issue) with the given title, description, and acceptance criteria.",
    schema: z.object({
      title: z.string().describe("Story title/summary"),
      description: z.string().describe("Story description"),
      acceptanceCriteria: z.array(z.string()).describe("List of acceptance criteria"),
    }),
  }
);

export { createJiraStoryTool };
export const jiraTools = [createJiraStoryTool];
