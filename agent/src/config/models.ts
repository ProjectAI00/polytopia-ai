/**
 * LLM Model Configuration
 * Adapted from imessage-bridge
 */

export const BLOCKED_MODELS = new Set([
  "x-ai/grok-code-fast-1",
  "x-ai/grok-4-fast",
  "x-ai/grok-4",
]);

// Default model for Polytopia agent - needs good reasoning
export const MODEL_DEFAULT = "anthropic/claude-sonnet-4";
export const MODEL_FAST = "openai/gpt-4o-mini";
export const MODEL_STRONG = "anthropic/claude-sonnet-4";
export const MODEL_COPILOT_DEFAULT = "gpt-5.1-codex-mini";

const COPILOT_MODEL_ALIASES: Record<string, string> = {
  "openai/gpt-5.1-codex-mini": "gpt-5.1-codex-mini",
  "openai/gpt-5.1-codex": "gpt-5.1-codex",
  "openai/gpt-5.1-codex-max": "gpt-5.1-codex-max",
  "openai/gpt-5.1": "gpt-5.1",
  "openai/gpt-5-mini": "gpt-5-mini",
  "openai/gpt-4.1": "gpt-4.1",
  "gpt-5.1-mini-codex": "gpt-5.1-codex-mini",
  "gpt-5-mini": "gpt-5-mini",
  "gpt-5.1-codex-mini": "gpt-5.1-codex-mini",
  "gpt-5.1-codex": "gpt-5.1-codex",
  "gpt-5.1-codex-max": "gpt-5.1-codex-max",
  "gpt-5.1": "gpt-5.1",
  "gpt-5.2-codex": "gpt-5.2-codex",
  "gpt-5.2": "gpt-5.2",
  "gpt-5.3-codex": "gpt-5.3-codex",
  "gpt-4.1": "gpt-4.1",
  "anthropic/claude-sonnet-4.5": "claude-sonnet-4.5",
  "anthropic/claude-haiku-4.5": "claude-haiku-4.5",
  "anthropic/claude-opus-4.6": "claude-opus-4.6",
  "google/gemini-3-pro-preview": "gemini-3-pro-preview",
  "claude-sonnet-4.5": "claude-sonnet-4.5",
  "claude-haiku-4.5": "claude-haiku-4.5",
  "claude-opus-4.6": "claude-opus-4.6",
  "gemini-3-pro-preview": "gemini-3-pro-preview",
};

export const resolveModel = (candidate?: string | null): string => {
  if (!candidate || BLOCKED_MODELS.has(candidate)) {
    return MODEL_DEFAULT;
  }
  return candidate;
};

export const resolveDefaultModel = (override?: string | null): string => {
  return resolveModel(
    override ??
      process.env.OR_MODEL ??
      process.env.MODEL_DEFAULT ??
      MODEL_DEFAULT
  );
};

export const resolveCopilotModel = (override?: string | null): string => {
  const selected =
    override ??
    process.env.COPILOT_MODEL ??
    process.env.MODEL_COPILOT_DEFAULT ??
    MODEL_COPILOT_DEFAULT;
  const normalized = selected.trim().toLowerCase();
  return COPILOT_MODEL_ALIASES[normalized] ?? selected;
};
