import { Router } from "express";
import storyRoutes from "./storyRoutes.js";
import voiceRoutes from "./voiceRoutes.js";

const router = Router();

router.use("/", storyRoutes);
router.use("/", voiceRoutes);

export default router;
