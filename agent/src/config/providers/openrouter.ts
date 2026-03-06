import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { resolveDefaultModel } from "../models.js";
import type { ProviderRequest, TextGenerationProvider } from "./types.js";

export const openRouterProvider: TextGenerationProvider = {
  id: "openrouter",
  name: "OpenRouter",
  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.OPENROUTER_API_KEY);
  },
  async generateText(request: ProviderRequest): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter");
    }

    const openrouter = createOpenRouter({ apiKey });
    const result = await generateText({
      model: openrouter(resolveDefaultModel(request.model)),
      messages: [
        ...(request.systemPrompt
          ? [{ role: "system" as const, content: request.systemPrompt }]
          : []),
        { role: "user" as const, content: request.prompt },
      ],
      temperature: request.temperature,
    });

    return result.text;
  },
};
