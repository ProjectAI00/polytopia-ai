import { existsSync, readFileSync } from "fs";
import { spawn } from "child_process";
import { resolveCopilotModel } from "../models.js";
import type { ProviderRequest, TextGenerationProvider } from "./types.js";

type CopilotSDK = typeof import("@github/copilot-sdk");
type CopilotClientInstance = InstanceType<CopilotSDK["CopilotClient"]>;
type CopilotSession = Awaited<ReturnType<CopilotClientInstance["createSession"]>>;

let clientPromise: Promise<CopilotClientInstance> | null = null;

function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (
          typeof entry === "object" &&
          entry !== null &&
          "type" in entry &&
          entry.type === "text" &&
          "text" in entry &&
          typeof entry.text === "string"
        ) {
          return entry.text;
        }
        return "";
      })
      .join("");
  }

  if (
    typeof content === "object" &&
    content !== null &&
    "text" in content &&
    typeof content.text === "string"
  ) {
    return content.text;
  }

  return "";
}

async function hasGitHubAuth(): Promise<boolean> {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
    return true;
  }

  const home = process.env.HOME;
  if (home) {
    const configPath = `${home}/.copilot/config.json`;
    if (existsSync(configPath)) {
      try {
        const parsed = JSON.parse(readFileSync(configPath, "utf8")) as {
          logged_in_users?: unknown[];
        };
        if (Array.isArray(parsed.logged_in_users) && parsed.logged_in_users.length > 0) {
          return true;
        }
      } catch {
        // Ignore parse errors and fall back to gh auth status.
      }
    }
  }

  return new Promise<boolean>((resolve) => {
    const proc = spawn("gh", ["auth", "status"]);
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

async function getCopilotClient(): Promise<CopilotClientInstance> {
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const sdk = await import("@github/copilot-sdk");
        const client = new sdk.CopilotClient({
          autoStart: true,
          autoRestart: true,
        });
        await client.start();
        return client;
      } catch (error) {
        clientPromise = null;
        const message =
          error instanceof Error ? error.message : "Unknown Copilot SDK error";
        throw new Error(
          `GitHub Copilot SDK is unavailable. Install @github/copilot-sdk in agent/ before using LLM_PROVIDER=copilot. (${message})`
        );
      }
    })();
  }

  return clientPromise;
}

async function runCopilotCliPrompt(request: ProviderRequest): Promise<string> {
  const model = resolveCopilotModel(request.model);
  const prompt = request.systemPrompt
    ? `${request.systemPrompt}\n\n${request.prompt}`
    : request.prompt;

  return new Promise<string>((resolve, reject) => {
    const args = [
      "-s",
      "--no-custom-instructions",
      "--model",
      model,
      "-p",
      prompt,
    ];

    const proc = spawn("copilot", args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (error) => reject(error));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `copilot CLI fallback failed with exit code ${code}: ${stderr.trim() || "no error output"}`
          )
        );
        return;
      }

      const text = stdout.trim();
      if (!text) {
        reject(new Error("copilot CLI fallback returned an empty response"));
        return;
      }

      resolve(text);
    });
  });
}

async function runCopilotSession(
  session: CopilotSession,
  prompt: string
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let text = "";
    let sawDelta = false;
    let settled = false;

    const cleanup = (unsubscribe?: (() => void) | void) => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };

    const unsubscribe = session.on((event: { type: string; data?: any }) => {
      switch (event.type) {
        case "assistant.message_delta":
          sawDelta = true;
          text += event.data?.deltaContent ?? "";
          break;
        case "assistant.message":
          if (!sawDelta) {
            text += extractText(event.data?.content ?? event.data?.message ?? event.data);
          }
          break;
        case "session.error":
          if (!settled) {
            settled = true;
            cleanup(unsubscribe);
            reject(new Error(event.data?.message ?? "Unknown Copilot session error"));
          }
          break;
        case "session.idle":
          if (!settled) {
            settled = true;
            cleanup(unsubscribe);
            const trimmed = text.trim();
            if (!trimmed) {
              reject(new Error("Copilot returned an empty response"));
              return;
            }
            resolve(trimmed);
          }
          break;
      }
    });

    void session.send({ prompt }).catch((error: unknown) => {
      if (!settled) {
        settled = true;
        cleanup(unsubscribe);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

export const copilotProvider: TextGenerationProvider = {
  id: "copilot",
  name: "GitHub Copilot",
  async isAvailable(): Promise<boolean> {
    return hasGitHubAuth();
  },
  async initialize(): Promise<void> {
    if (await hasGitHubAuth()) {
      await getCopilotClient();
    }
  },
  async generateText(request: ProviderRequest): Promise<string> {
    if (!(await hasGitHubAuth())) {
      throw new Error(
        "GitHub Copilot authentication is required. Run `gh auth login` or `copilot /login` before using LLM_PROVIDER=copilot."
      );
    }

    try {
      const client = await getCopilotClient();
      const sessionConfig: {
        model: string;
        streaming: boolean;
        systemMessage?: { mode: "replace"; content: string };
      } = {
        model: resolveCopilotModel(request.model),
        streaming: true,
      };

      if (request.systemPrompt) {
        sessionConfig.systemMessage = {
          mode: "replace",
          content: request.systemPrompt,
        };
      }

      const session = await client.createSession(sessionConfig);
      return runCopilotSession(session, request.prompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (request.debug) {
        console.warn(
          `[CopilotProvider] SDK path failed, falling back to CLI prompt mode: ${message}`
        );
      }
      return runCopilotCliPrompt(request);
    }
  },
};
