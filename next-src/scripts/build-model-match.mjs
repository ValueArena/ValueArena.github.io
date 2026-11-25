/** Curate a small, balanced quiz from the checked-in saved EigenBench response packs. */
import { readFile, writeFile } from 'node:fs/promises';
const models = ['Claude Sonnet 5', 'GPT-5.6 Sol', 'DeepSeek V4 Pro', 'Kimi K2.6', 'Gemini 3.7 Flash'];
const ids = ['kindness', 'lockean-rights', 'taoism', 'conservatism'];
const packs = await Promise.all(ids.map(async id => JSON.parse(await readFile(new URL(`../public/judge/${id}.json`, import.meta.url), 'utf8'))));
const questions = [], seen = new Set();
for (let a = 0; a < models.length; a++) for (let b = a + 1; b < models.length; b++) {
  const pack = packs[questions.length % packs.length];
  const candidates = pack.matchups.filter(m => !seen.has(m.scenario) && [m.a.model, m.b.model].includes(models[a]) && [m.a.model, m.b.model].includes(models[b]));
  candidates.sort((a, b) => (a.scenario.length + a.a.response.length + a.b.response.length) - (b.scenario.length + b.a.response.length + b.b.response.length));
  const m = candidates[0];
  if (!m) throw new Error(`Missing unique scenario for ${models[a]} / ${models[b]}`);
  seen.add(m.scenario);
  questions.push({ id: m.id, scenario: m.scenario, a: m.a, b: m.b, value: pack.label, run: pack.run, judges: m.judges.map(({ name, side, score, line }) => ({ name, side, score, line })) });
}
await writeFile(new URL('../public/model-match.json', import.meta.url), JSON.stringify({ version: 1, models, questions }, null, 2) + '\n');
console.log(`Built ${questions.length} unique scenarios, ${models.length} models, four appearances each.`);
