import express from "express";
import { getUpsellSuggestions } from "../controllers/upsellController.js";

const router = express.Router();

router.get("/:itemId", getUpsellSuggestions);

export default router;
