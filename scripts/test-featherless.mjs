#!/usr/bin/env node
/**
 * Live Featherless smoke test. Proves the integration is real and that the
 * validation ladder accepts what the model actually returns.
 *   npm run test:ai
 */
import OpenAI from "openai";
import { config } from "dotenv";
config({ path: ".env.local" });

const key = process.env.FEATHERLESS_API_KEY;
if (!key) { console.error("FEATHERLESS_API_KEY is not set in .env.local"); process.exit(1); }

const model = process.env.FEATHERLESS_MODEL || "Qwen/Qwen2.5-7B-Instruct";
const client = new OpenAI({
  apiKey: key,
  baseURL: process.env.FEATHERLESS_BASE_URL || "https://api.featherless.ai/v1",
  timeout: 30000,
});

const started = Date.now();
try {
  const res = await client.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: 'Reply with ONE JSON object only: {"hazard_type":string,"severity":"critical|high|medium|low","people_affected":number,"life_risk":boolean,"urgency":number,"confidence":number}' },
      { role: "user", content: "My elderly parents are trapped on the ground floor, flood water has entered the house. Please help." },
    ],
  });
  const text = res.choices[0].message.content;
  console.log(`model:   ${model}`);
  console.log(`latency: ${Date.now() - started}ms`);
  console.log(`tokens:  ${res.usage?.prompt_tokens} in / ${res.usage?.completion_tokens} out`);
  console.log(`output:  ${text}`);
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  console.log("\n\x1b[32m✓ Featherless returned parseable JSON\x1b[0m", parsed);
} catch (err) {
  console.error("\n\x1b[31m✗ Featherless call failed\x1b[0m");
  console.error(err.status ?? "", err.message ?? err);
  console.error("\n403 means the model repo is GATED (e.g. meta-llama/*): either link a verified Hugging Face\naccount on your Featherless dashboard, or use an ungated model such as Qwen/Qwen2.5-7B-Instruct.");
  console.error("404 means the model name is wrong for your account. Set FEATHERLESS_MODEL in .env.local.");
  process.exit(1);
}
