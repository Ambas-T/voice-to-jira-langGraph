/**
 * Story generation service: LLM-based creation of Jira story (title, description, acceptance criteria).
 * Used by the LangGraph generate_story node and by the voice-to-Jira API.
 */
import * as dotenv from "dotenv";
dotenv.config();

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { GeneratedStory } from "../state.js";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) throw new Error("Missing GOOGLE_API_KEY");

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.7,
  maxOutputTokens: 4096,
  apiKey: GOOGLE_API_KEY,
});

const STORY_PROMPT = `You are a professional Product Manager creating a Jira story.

The user wants a story about: "{{topic}}"

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

export async function generateStory(
  topic: string
): Promise<{ ok: true; story: GeneratedStory } | { ok: false; error: string }> {
  const prompt = STORY_PROMPT.replace("{{topic}}", topic);
  try {
    const response = await llm.invoke(prompt);
    const content = response.content as string;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { ok: false, error: "Failed to parse LLM response as JSON" };
    }
    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: string;
      description?: string;
      acceptanceCriteria?: string[] | string;
    };
    return {
      ok: true,
      story: {
        title: parsed.title ?? `Story: ${topic}`,
        description: parsed.description ?? `Story about ${topic}`,
        acceptanceCriteria: Array.isArray(parsed.acceptanceCriteria)
          ? parsed.acceptanceCriteria
          : [parsed.acceptanceCriteria ?? "Story is complete"].filter(Boolean),
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
