// Azure OpenAI explainer (ADR-018): signs in with a token, sends the rules and the de-identified input, and keeps
// request and reply text out of errors (R10). A fake fetch stands in for Azure; synthetic input only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { azureOpenAIExplainer } from '../src/openai.ts';
import type { ExplainInput } from '../src/explain.ts';

const input: ExplainInput = { pathway: 'pregnancy_planning', country: 'NG', score: 62, band: 'Getting ready', opening: 'Opening.', focus: [] };
const credential = { getToken: async () => ({ token: 'synthetic-token' }) };

test('calls the deployment with a bearer token, the rules as system text and JSON output', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"summary":"ok","areas":[]}' } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const ex = azureOpenAIExplainer({ endpoint: 'https://oai-test.openai.azure.com/', deployment: 'explain' }, credential, fake);
  assert.equal(await ex.explain('RULES', input), '{"summary":"ok","areas":[]}');
  assert.equal(ex.model, 'azure-openai:explain');
  assert.equal(seen!.url, 'https://oai-test.openai.azure.com/openai/v1/chat/completions');
  assert.equal((seen!.init.headers as Record<string, string>).authorization, 'Bearer synthetic-token');
  const body = JSON.parse(seen!.init.body as string);
  assert.equal(body.model, 'explain');
  assert.deepEqual(body.messages[0], { role: 'system', content: 'RULES' });
  assert.deepEqual(JSON.parse(body.messages[1].content), input);
  assert.equal(body.response_format.type, 'json_schema');
  assert.deepEqual(body.response_format.json_schema.schema.required, ['summary', 'areas']);
});

test('errors name the status only, never text from the request or the reply', async () => {
  const fake = (async () => new Response('{"error":{"message":"Getting ready 62 secret detail"}}', { status: 400 })) as unknown as typeof fetch;
  const ex = azureOpenAIExplainer({ endpoint: 'https://oai-test.openai.azure.com', deployment: 'explain' }, credential, fake);
  await assert.rejects(ex.explain('RULES', input), (e: Error) => e.message === 'openai_400');
  const empty = (async () => new Response(JSON.stringify({ choices: [{ message: { content: null }, finish_reason: 'content_filter' }] }), { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(azureOpenAIExplainer({ endpoint: 'https://x', deployment: 'd' }, credential, empty).explain('R', input), (e: Error) => e.message === 'openai_empty_content_filter');
});
