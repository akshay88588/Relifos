import OpenAI from "openai";

export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface RawCompletion {
  text: string;
  model: string;
  provider: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface AIProvider {
  readonly name: string;
  complete(req: CompletionRequest): Promise<RawCompletion>;
  health(): Promise<{ ok: boolean; latencyMs?: number; model?: string; error?: string }>;
}

export class AIProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AIProviderError";
  }
}

/**
 * Featherless.ai - OpenAI-compatible serverless inference for open-weight models.
 * This is the only place in the codebase that talks to a model. It runs on the
 * server only; the API key is never sent to the browser.
 */
export class FeatherlessProvider implements AIProvider {
  readonly name = "featherless";
  private client: OpenAI;
  private model: string;
  private fallbackModel: string;

  constructor() {
    const apiKey = process.env.FEATHERLESS_API_KEY;
    if (!apiKey) throw new AIProviderError("FEATHERLESS_API_KEY is not set");
    this.client = new OpenAI({
      apiKey,
      baseURL: process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1",
      timeout: 20_000,
      maxRetries: 0,
    });
    this.model = process.env.FEATHERLESS_MODEL || "Qwen/Qwen2.5-7B-Instruct";
    this.fallbackModel = process.env.FEATHERLESS_MODEL_FALLBACK || this.model;
  }

  async complete(req: CompletionRequest): Promise<RawCompletion> {
    const model = req.model || this.model;
    try {
      return await this.call(model, req, true);
    } catch (err) {
      // Some models reject response_format; retry once without it, then once on
      // the fallback model. Anything after that is a genuine provider failure.
      try {
        return await this.call(model, req, false);
      } catch {
        return await this.call(this.fallbackModel, req, false);
      }
    }
  }

  private async call(model: string, req: CompletionRequest, jsonMode: boolean): Promise<RawCompletion> {
    const started = Date.now();
    try {
      const res = await this.client.chat.completions.create({
        model,
        temperature: req.temperature ?? 0.1,
        max_tokens: req.maxTokens ?? 500,
        ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      });
      const text = res.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) throw new AIProviderError("Empty completion from provider");
      return {
        text,
        model,
        provider: this.name,
        latencyMs: Date.now() - started,
        promptTokens: res.usage?.prompt_tokens,
        completionTokens: res.usage?.completion_tokens,
      };
    } catch (err: any) {
      throw new AIProviderError(
        `Featherless call failed (${model}): ${err?.status ?? ""} ${err?.message ?? String(err)}`,
        err,
      );
    }
  }

  async health() {
    const started = Date.now();
    try {
      const r = await this.complete({
        system: "Reply with JSON only.",
        user: 'Return exactly {"ok":true}',
        maxTokens: 20,
      });
      return { ok: true, latencyMs: Date.now() - started, model: r.model };
    } catch (err: any) {
      return { ok: false, latencyMs: Date.now() - started, error: err?.message ?? String(err) };
    }
  }
}

let cached: AIProvider | null = null;
export function getProvider(): AIProvider | null {
  if (!process.env.FEATHERLESS_API_KEY) return null;
  if (!cached) cached = new FeatherlessProvider();
  return cached;
}
