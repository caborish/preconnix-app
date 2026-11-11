// Sample AI-assisted explanations for Dr Gloria's review (ADR-018, R12/R13). Synthetic results only: random answers
// scored by the real engine, then explained by the staging model exactly as the API does it (same rules, same input,
// same checker, one retry). Signs in as the person running it (az login); writes JSON for the review page.
//
//   AZURE_OPENAI_ENDPOINT=https://… AZURE_OPENAI_DEPLOYMENT=explain node services/api/scripts/ai-samples.ts 25 out.json
import { writeFileSync } from 'node:fs';
import { AzureCliCredential } from '@azure/identity';
import { score, validateSubmission, type Submission } from '@preconnix/assessment-engine';
import { AI_RULES, buildExplainInput, checkExplanation } from '../src/explain.ts';
import { azureOpenAIExplainer } from '../src/openai.ts';
import { loadRegistry } from '../src/registry.ts';

const count = Number(process.argv[2] ?? 25);
const out = process.argv[3] ?? 'ai-samples.json';
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'explain';
if (!endpoint) throw new Error('Set AZURE_OPENAI_ENDPOINT');

const { definition: def, policy } = loadRegistry().current;
const explainer = azureOpenAIExplainer({ endpoint, deployment }, new AzureCliCredential());

// Seeded, so the same set can be produced again.
let seed = 20261104;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const opt = (field: string, value: string) => `profile.${field}.${value}`;
const plans = ['yes', 'yes', 'unsure', 'no'];
const label = (field: string, id: string) => def.profile.find(p => p.id === field)?.options.find(o => o.id === id)?.label ?? id;

const samples = [];
for (let n = 0; n < count; n++) {
  const plan = plans[n % plans.length];
  const profile = {
    age: opt('age', pick(['20-34', '20-34', 'u20', '35-39', '40+'])),
    country: opt('country', 'NG'),
    cycle: opt('cycle', pick(['regular', 'regular', 'irregular', 'absent'])),
    everpreg: opt('everpreg', pick(['yes', 'no'])),
    plan: opt('plan', plan)
  };
  // How well she is doing overall: the chance of choosing the best answer to each question.
  const strength = [0.85, 0.6, 0.35][n % 3];
  const answers: Record<string, string> = {};
  for (const s of def.sections) {
    for (const q of s.questions) {
      const ranked = [...q.options].sort((a, b) => (policy.itemPoints[b.id] ?? 0) - (policy.itemPoints[a.id] ?? 0));
      answers[q.id] = (rand() < strength ? ranked[0] : pick(ranked)).id;
    }
  }
  // Keep only the questions that apply to her answers above.
  const sub: Submission = { profile, answers };
  const v = validateSubmission(def, sub);
  const notApplicable = new Set(v.issues.filter(i => i.code !== 'missing_answer').map(i => i.ref));
  for (const id of Object.keys(answers)) if (notApplicable.has(id)) delete answers[id];
  const result = score(def, policy, { profile, answers });
  const input = buildExplainInput(def, policy, result, 'NG', answers);

  const attempts: { reason: string; raw: string }[] = [];
  let explanation = null;
  for (let attempt = 0; attempt < 2 && !explanation; attempt++) {
    let raw = '';
    try {
      raw = await explainer.explain(AI_RULES.text, input);
    } catch (e) {
      attempts.push({ reason: (e as Error).message, raw: '' });
      continue;
    }
    const checked = checkExplanation(raw, input);
    if (checked.ok) explanation = checked.explanation;
    else attempts.push({ reason: checked.reason, raw });
  }
  samples.push({
    n: n + 1,
    profile: { age: label('age', profile.age), plan: label('plan', profile.plan), cycle: label('cycle', profile.cycle), everPregnant: label('everpreg', profile.everpreg) },
    input, explanation, rejected: attempts
  });
  console.log(`${n + 1}/${count}: ${explanation ? 'passed' : 'not available'}${attempts.length ? ` (checker: ${attempts.map(a => a.reason).join(', ')})` : ''}`);
}
writeFileSync(out, JSON.stringify({ rules: AI_RULES, model: `${deployment} (gpt-oss-120b)`, createdOn: new Date().toISOString().slice(0, 10), samples }, null, 2));
console.log(`Wrote ${out}`);
