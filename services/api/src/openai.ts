// Azure OpenAI for AI-assisted explanations (ADR-018; owner chose Azure OpenAI on 4 Nov 2026). The API signs in with
// its managed identity: there is no key. Neither the input nor the reply is logged, and errors carry only the HTTP
// status, never text from the request or the reply (R10). Whatever comes back still passes checkExplanation.
import type { Explainer } from './explain.ts';

interface TokenSource { getToken(scope: string): Promise<{ token: string } | null> }

const SCOPE = 'https://cognitiveservices.azure.com/.default';

/** The reply shape from AI_RULES, enforced by the model service; lengths and wording are still checked afterwards. */
const REPLY_SCHEMA = {
  name: 'explanation',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['summary', 'areas'],
    properties: {
      summary: { type: 'string' },
      areas: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['code', 'explanation', 'askYourProvider'],
          properties: { code: { type: 'string' }, explanation: { type: 'string' }, askYourProvider: { type: 'array', items: { type: 'string' } } }
        }
      }
    }
  }
};

export function azureOpenAIExplainer(cfg: { endpoint: string; deployment: string }, credential: TokenSource, fetcher: typeof fetch = fetch): Explainer {
  const url = `${cfg.endpoint.replace(/\/+$/, '')}/openai/v1/chat/completions`;
  return {
    model: `azure-openai:${cfg.deployment}`,
    async explain(rules, input) {
      const token = (await credential.getToken(SCOPE))?.token;
      if (!token) throw new Error('openai_no_token');
      const res = await fetcher(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: cfg.deployment,
          messages: [
            { role: 'system', content: rules },
            { role: 'user', content: JSON.stringify(input) }
          ],
          response_format: { type: 'json_schema', json_schema: REPLY_SCHEMA },
          reasoning_effort: 'low',
          max_completion_tokens: 4000
        }),
        signal: AbortSignal.timeout(45_000)
      });
      if (!res.ok) throw new Error(`openai_${res.status}`);
      const body = await res.json() as { choices?: { message?: { content?: string | null }; finish_reason?: string }[] };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content) throw new Error(`openai_empty_${body.choices?.[0]?.finish_reason ?? 'unknown'}`);
      return content;
    }
  };
}
