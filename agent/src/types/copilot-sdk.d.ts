declare module "@github/copilot-sdk" {
  export interface CopilotSessionEvent {
    type: string;
    data?: any;
  }

  export interface CopilotSessionConfig {
    model?: string;
    streaming?: boolean;
    systemMessage?: {
      mode: "replace";
      content: string;
    };
  }

  export interface CopilotSession {
    id?: string;
    sessionId?: string;
    on(handler: (event: CopilotSessionEvent) => void): (() => void) | void;
    send(input: { prompt: string }): Promise<void>;
    abort?(): Promise<void>;
  }

  export class CopilotClient {
    constructor(config?: { autoStart?: boolean; autoRestart?: boolean });
    start(): Promise<void>;
    createSession(config: CopilotSessionConfig): Promise<CopilotSession>;
  }
}
