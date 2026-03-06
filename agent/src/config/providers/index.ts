import { copilotProvider } from "./copilot.js";
import { openRouterProvider } from "./openrouter.js";
import type { TextGenerationProvider } from "./types.js";

const providers = new Map<string, TextGenerationProvider>([
  [openRouterProvider.id, openRouterProvider],
  [copilotProvider.id, copilotProvider],
]);

export function getConfiguredProviderId(override?: string): string {
  return (override ?? process.env.LLM_PROVIDER ?? "copilot").toLowerCase();
}

export function getProvider(override?: string): TextGenerationProvider {
  const providerId = getConfiguredProviderId(override);
  const provider = providers.get(providerId);
  if (!provider) {
    throw new Error(
      `Unknown LLM provider '${providerId}'. Supported providers: ${Array.from(providers.keys()).join(", ")}`
    );
  }
  return provider;
}

export async function initializeProviders(): Promise<void> {
  const provider = getProvider();
  if (!(await provider.isAvailable())) {
    if (provider.id === "copilot") {
      throw new Error(
        "LLM_PROVIDER=copilot requires GitHub authentication and the @github/copilot-sdk package."
      );
    }
    throw new Error(
      `LLM provider '${provider.id}' is unavailable. Check its required environment variables before starting the server.`
    );
  }

  await provider.initialize?.();
}
