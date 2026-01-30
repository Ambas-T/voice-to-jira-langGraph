/**
 * Jira client service: create issues via REST API, resolve issue types.
 * Used by the LangGraph create_jira node and by the voice-to-Jira API.
 */
import * as dotenv from "dotenv";
dotenv.config();

import type { CreateJiraPayload, CreateJiraResult } from "../state.js";

const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_DOMAIN = process.env.JIRA_DOMAIN;
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

if (!JIRA_EMAIL) throw new Error("Missing JIRA_EMAIL");
if (!JIRA_API_TOKEN) throw new Error("Missing JIRA_API_TOKEN");
if (!JIRA_DOMAIN) throw new Error("Missing JIRA_DOMAIN");
if (!JIRA_PROJECT_KEY) throw new Error("Missing JIRA_PROJECT_KEY");

const JIRA_BASE_URL = `https://${JIRA_DOMAIN}.atlassian.net`;

function authHeader(): string {
  return `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`;
}

/** Get issue types for the project (cached for performance). */
let cachedIssueTypes: Array<{ name: string; id: string; subtask?: boolean }> | null = null;

async function fetchIssueTypes(): Promise<Array<{ name: string; id: string; subtask?: boolean }>> {
  if (cachedIssueTypes) return cachedIssueTypes;
  try {
    const response = await fetch(
      `${JIRA_BASE_URL}/rest/api/3/project/${JIRA_PROJECT_KEY}`,
      {
        method: "GET",
        headers: {
          Authorization: authHeader(),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );
    if (!response.ok) return [];
    const project = (await response.json()) as {
      issueTypes?: Array<{ name: string; id: string; subtask?: boolean }>;
    };
    cachedIssueTypes = project.issueTypes ?? [];
    return cachedIssueTypes;
  } catch {
    return [];
  }
}

export async function getIssueTypeId(): Promise<string> {
  const issueTypes = await fetchIssueTypes();
  if (!issueTypes.length) return "10001";
  const nonSubtask = issueTypes.filter(
    (it) => !it.subtask && !it.name.toLowerCase().includes("sub")
  );
  const storyType = nonSubtask.find((it) => it.name.toLowerCase() === "story");
  if (storyType) return storyType.id;
  const taskType = nonSubtask.find((it) => it.name.toLowerCase() === "task");
  if (taskType) return taskType.id;
  const storyOrTask = nonSubtask.find(
    (it) =>
      it.name.toLowerCase().includes("story") ||
      it.name.toLowerCase().includes("task")
  );
  if (storyOrTask) return storyOrTask.id;
  const first = nonSubtask[0];
  return first?.id ?? "10001";
}

/** Get the Sub-task issue type ID for creating subtasks linked to a parent. */
export async function getSubtaskIssueTypeId(): Promise<string> {
  const issueTypes = await fetchIssueTypes();
  if (!issueTypes.length) return "10003"; // common default for subtask
  // Find a subtask type
  const subtaskType = issueTypes.find(
    (it) => it.subtask === true || it.name.toLowerCase() === "sub-task" || it.name.toLowerCase() === "subtask"
  );
  if (subtaskType) return subtaskType.id;
  // Fallback: look for anything with "sub" in the name
  const subLike = issueTypes.find((it) => it.name.toLowerCase().includes("sub"));
  if (subLike) return subLike.id;
  return "10003";
}

export async function createJiraStory(
  payload: CreateJiraPayload
): Promise<{ ok: true; result: CreateJiraResult } | { ok: false; error: string }> {
  const { title, description, acceptanceCriteria, optionalFields } = payload;
  if (!title || !description || !acceptanceCriteria?.length) {
    return { ok: false, error: "Missing story content" };
  }
  try {
    // Use subtask issue type if parentKey is provided, otherwise use story/task type
    const isSubtask = Boolean(optionalFields?.parentKey);
    const issueTypeId = isSubtask
      ? await getSubtaskIssueTypeId()
      : await getIssueTypeId();

    const descriptionParagraphs = description.split("\n\n").filter((p: string) => p.trim());
    const descriptionContent: Array<Record<string, unknown>> = [];
    descriptionParagraphs.forEach((para: string) => {
      descriptionContent.push({
        type: "paragraph",
        content: [{ type: "text", text: para.trim() }],
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
    acceptanceCriteria.forEach((criteria: string) => {
      descriptionContent.push({
        type: "paragraph",
        content: [{ type: "text", text: `☐ ${criteria}` }],
      });
    });

    const fields: Record<string, unknown> = {
      project: { key: JIRA_PROJECT_KEY },
      summary: title,
      description: { type: "doc", version: 1, content: descriptionContent },
      issuetype: { id: issueTypeId },
    };
    if (optionalFields) {
      if (optionalFields.parentKey) {
        fields.parent = { key: optionalFields.parentKey };
      }
      if (optionalFields.dueDate) fields.duedate = optionalFields.dueDate;
      if (optionalFields.startDate) fields.customfield_10015 = optionalFields.startDate;
      if (optionalFields.labels?.length) fields.labels = optionalFields.labels;
    }

    const response = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });
    if (!response.ok) {
      const error = await response.text();
      return { ok: false, error: `Jira API error: ${error}` };
    }
    const result = (await response.json()) as { key: string };
    const createResult: CreateJiraResult = {
      jiraKey: result.key,
      jiraUrl: `${JIRA_BASE_URL}/browse/${result.key}`,
    };
    if (optionalFields?.parentKey) {
      createResult.parentKey = optionalFields.parentKey;
      createResult.parentUrl = `${JIRA_BASE_URL}/browse/${optionalFields.parentKey}`;
    }
    return { ok: true, result: createResult };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
