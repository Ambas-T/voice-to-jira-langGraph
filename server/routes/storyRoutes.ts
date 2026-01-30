import { Router } from "express";
import type { Request, Response } from "express";
import { generateStory, createJiraStory } from "../../langgraph/index.js";

const router = Router();

interface GenerateStoryBody {
  topic?: string;
}

interface CreateJiraBody {
  title?: string;
  description?: string;
  acceptanceCriteria?: string[];
  optionalFields?: {
    parentKey?: string;
    dueDate?: string;
    startDate?: string;
    labels?: string[];
    teamId?: string;
  };
}

router.post("/generate-story", async (req: Request, res: Response) => {
  try {
    const { topic } = req.body as GenerateStoryBody;
    if (!topic || typeof topic !== "string") {
      res.status(400).json({ error: "Missing or invalid topic" });
      return;
    }
    const result = await generateStory(topic.trim());
    if (result.ok) {
      res.json({ story: result.story });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

router.post("/create-jira", async (req: Request, res: Response) => {
  try {
    const { title, description, acceptanceCriteria, optionalFields } =
      req.body as CreateJiraBody;
    if (!title || !description || !Array.isArray(acceptanceCriteria)) {
      res.status(400).json({
        error: "Missing title, description, or acceptanceCriteria",
      });
      return;
    }
    const result = await createJiraStory({
      title,
      description,
      acceptanceCriteria,
      optionalFields,
    });
    if (result.ok) {
      res.json(result.result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

export default router;
