// The Reproductive Life Plan guide for Nigeria (planGuide.ts): rules over the latest result. Synthetic results only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  areaExplainer, essentialsFor, ESSENTIALS, GUIDANCE, PLAN_GUIDE_APPROVAL, planGuideProblems, planPath, suggestedGoals, suggestedQuestions
} from '@preconnix/content';

const focus = [
  { code: 'physical_nutrition', name: 'Physical & Nutritional Health', percent: 40 },
  { code: 'infectious_immunization', name: 'Infectious Diseases & Immunizations', percent: 55 },
  { code: 'mental_social_env', name: 'Mental, Social & Environmental', percent: 80 }
];

test('the guide is complete and approved by Dr Gloria', () => {
  assert.deepEqual(planGuideProblems(), []);
  assert.equal(PLAN_GUIDE_APPROVAL.approved, true);
  assert.ok(PLAN_GUIDE_APPROVAL.reviewedBy && PLAN_GUIDE_APPROVAL.reviewedOn, 'approval names the reviewer and date');
});

test('the plan follows her answer, and her result when she has not said', () => {
  assert.deepEqual(planPath({ intention: 'planning_now', focus }), { pregnancy: true, notPlanning: false });
  assert.deepEqual(planPath({ intention: 'not_planning', focus }), { pregnancy: false, notPlanning: true });
  assert.deepEqual(planPath({ intention: 'unsure', focus }), { pregnancy: true, notPlanning: false }, '"not sure" is with the pregnancy path');
  assert.deepEqual(planPath({ intention: 'prefer_not_say', pathway: 'pregnancy_planning', focus }), { pregnancy: true, notPlanning: false });
  assert.deepEqual(planPath({ intention: null, pathway: 'general_wellness', focus }), { pregnancy: false, notPlanning: true });
});

test('essentials fit her path, and those matching her lowest areas come first with a reason', () => {
  const planning = essentialsFor({ intention: 'planning_now', focus }).map(e => e.id);
  assert.ok(planning.includes('folic_acid') && planning.includes('malaria') && !planning.includes('contraception'));
  const notPlanning = essentialsFor({ intention: 'not_planning', focus }).map(e => e.id);
  assert.ok(notPlanning.includes('contraception') && !notPlanning.includes('folic_acid'));
  assert.ok(notPlanning.includes('genotype'), 'some essentials are for everyone');

  const ranked = essentialsFor({ intention: 'planning_now', focus });
  assert.ok(ranked[0].domains.includes('physical_nutrition'), 'lowest area first');
  assert.equal(ranked[0].reason, 'From your result: Physical & Nutritional Health (40%)');
  const firstOther = ranked.findIndex(e => !e.recommended);
  assert.ok(ranked.slice(firstOther).every(e => !e.recommended), 'recommended ones before the rest');
});

test('goals for the next 3 months skip what is done or already planned, and three are ticked for her', () => {
  const g = suggestedGoals({ intention: 'planning_now', focus }, ['folic_acid'], ['Iron-rich food at one meal a day']);
  const titles = g.map(x => x.essential.goal.title);
  assert.ok(!titles.includes('Take my folic acid supplement'), 'done essentials are not suggested');
  assert.ok(!titles.includes('Iron-rich food at one meal a day'), 'goals already in the plan are not suggested');
  assert.equal(g.filter(x => x.preselected).length, 3);
  const areas = g.filter(x => x.preselected).map(x => focus.find(f => x.essential.domains.includes(f.code))?.code);
  assert.equal(new Set(areas).size, 3, 'one ticked goal for each of her three areas');
  assert.equal(new Set(titles).size, titles.length, 'each goal once');
});

test('area explanations are Dr Gloria\'s approved words for her level', () => {
  const x = areaExplainer(focus[0]);
  assert.equal(x.level, 'priority');
  assert.ok(GUIDANCE.domain.physical_nutrition.priority.startsWith(x.text));
  assert.equal(areaExplainer({ code: 'unknown', name: 'X', percent: 10 }).text, 'Talk with your healthcare provider about this area at your next visit.');
});

test('questions for the provider prefer the AI explanation\'s, then her areas\', at most four, no repeats', () => {
  const q = suggestedQuestions(focus, ['Which vaccines and tests do I need?', 'What should I ask about iron?']);
  assert.equal(q[0], 'Which vaccines and tests do I need?');
  assert.equal(q.length, 4);
  assert.equal(new Set(q.map(x => x.toLowerCase())).size, 4);
  assert.ok(suggestedQuestions([]).length >= 1, 'a general question without a result');
});

test('essentials use no doses or numbers beyond the approved folic acid wording', () => {
  for (const e of ESSENTIALS) {
    const numbers = `${e.title} ${e.why}`.match(/\d+/g) ?? [];
    if (e.id === 'folic_acid') assert.deepEqual(numbers, ['400']);
    else assert.deepEqual(numbers, [], e.id);
  }
});

test('the plan PDF is a visual board: score, path, areas, goal cards, ticks, vaccines; no blanks to fill in', async () => {
  const { buildPlanHtml, planFileName } = await import('@preconnix/content');
  const I = '<path d="M1 1"/>';
  const html = buildPlanHtml({
    date: '5 November 2026', name: 'Ada', path: 'pregnancy', pathIcon: I, plan: ['Planning a pregnancy now', 'Within 1 year'],
    result: { score: 62, band: 'moderate', bandLabel: 'Moderate', areas: [{ name: 'Physical & Nutritional Health', percent: 45, level: 'A priority', icon: I }] },
    goals: [{ title: 'Book a <b>check</b>', how: 'Once', by: '4 Dec 2026', done: false, icon: I }],
    essentials: [{ title: 'Sleep under a treated mosquito net', done: true, icon: I }],
    vaccines: [{ name: 'HPV', done: true }, { name: 'Hepatitis B', done: false }],
    support: ['Family'], supportIcon: I, questions: ['One?', 'Two?', 'Three?', 'Four?'], reviewDate: '4 Feb 2027'
  });
  for (const s of ['Reproductive Health Score', 'My path: getting ready for pregnancy', 'My focus areas', 'My goals', 'Health essentials', 'My vaccines', 'My support', 'Ask my provider', 'Ada\u2019s plan', '5 November 2026'])
    assert.ok(html.includes(s), s);
  assert.ok(html.includes('Book a &lt;b&gt;check&lt;/b&gt;'), 'her text is escaped');
  assert.ok(!html.includes('Four?'), 'at most three questions');
  for (const s of ['Notes from my visit', 'Answer:', 'Name:', 'class="write"']) assert.ok(!html.includes(s), `no fill-in: ${s}`);
  assert.ok(!/@[a-z]/.test(html.replace(/@page|@media/g, '')), 'no email');
  const other = buildPlanHtml({ date: 'x', path: 'health', pathIcon: I, plan: [], goals: [], essentials: [], vaccines: [], support: [], supportIcon: I, questions: [] });
  assert.ok(other.includes('My path: caring for my reproductive health') && other.includes('My plan'));
  assert.equal(planFileName('2026-11-04'), 'PreConnix_My_Reproductive_Life_Plan_2026-11-04.pdf');
});

test('not planning a pregnancy: contraception, infections, vaccines and alcohol come first', () => {
  const ids = essentialsFor({ intention: 'not_planning', focus: [{ code: 'physical_nutrition', name: 'Physical & Nutritional Health', percent: 20 }] }).map(e => e.id);
  assert.deepEqual(ids.slice(0, 6), ['contraception', 'sti_prevention', 'infection_tests', 'vaccines', 'alcohol_less', 'smoking']);
  assert.ok(!ids.includes('folic_acid') && !ids.includes('alcohol'), 'no pregnancy items');
  const preg = essentialsFor({ intention: 'unsure', focus: [] }).map(e => e.id);
  assert.ok(preg.includes('folic_acid') && !preg.includes('contraception'));
});
