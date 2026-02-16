import express from "express";
import { handleTurnRequest } from "./api/turn.js";
import { handleReloadPrompt } from "./api/reload.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "polytopia-agent" });
});

// Main endpoint - PolyMod calls this each turn
app.post("/api/turn", handleTurnRequest);

// Hot-reload endpoint - Update AI prompt mid-game
app.get("/api/reload-prompt", handleReloadPrompt);
app.post("/api/reload-prompt", handleReloadPrompt);

app.listen(PORT, () => {
  console.log(`[polytopia-agent] Server running on port ${PORT}`);
  console.log(`[polytopia-agent] POST /api/turn - Process game turn`);
  console.log(`[polytopia-agent] GET /health - Health check`);
  console.log(`[polytopia-agent] POST /api/reload-prompt - Hot-reload AI prompt`);
});


