export interface ProviderRequest {
  model?: string;
  systemPrompt?: string;
  prompt: string;
  temperature: number;
  debug?: boolean;
}

export interface TextGenerationProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  initialize?(): Promise<void>;
  generateText(request: ProviderRequest): Promise<string>;
}
