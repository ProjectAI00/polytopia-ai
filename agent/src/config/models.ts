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


