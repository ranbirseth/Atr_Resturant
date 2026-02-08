import Item from "../models/Item.js";
import { upsellRules } from "../config/upsellRules.js";

export const getUpsellSuggestions = async (req, res) => {
  try {
    const item = await Item.findById(req.params.itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const suggestions =
      upsellRules[item.category] || upsellRules["Default"];

    const upsellItems = await Item.find({
      name: { $in: suggestions }
    });

    res.json(upsellItems);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
