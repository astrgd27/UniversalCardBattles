// Compiles every default module that has a Workshop blueprint (packages/modules/<id>/blueprint.json) into its module
// files (manifest, rules, cards, decks, ai), so the shipped games stay editable in the Workshop. Usage: npm run -s modules
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { compileModule, validateIssues, issueText } from '#engine';
import { compileBlueprint } from '../../maker/src/compile.ts';
import { MOD_DIR } from './index.ts';

let bad = 0;
for (const id of readdirSync(MOD_DIR)) {
  const f = join(MOD_DIR, id, 'blueprint.json');
  if (!existsSync(f)) continue;
  const def = compileBlueprint(JSON.parse(readFileSync(f, 'utf8'))) as any;
  const issues = validateIssues(def);
  for (const i of issues) console.log(`${id}: ${issueText(i)}`);
  bad += issues.length;
  compileModule(def);
  const w = (name: string, v: unknown) => writeFileSync(join(MOD_DIR, id, name), JSON.stringify(v) + '\n');
  w('manifest.json', def.manifest); w('rules.json', def.rules); w('cards.json', def.cards); w('decks.json', def.decks);
  mkdirSync(join(MOD_DIR, id, 'ai'), { recursive: true });
  w('ai/ai.json', def.ai);
  console.log(`${id}: ${def.cards.length} cards, ${Object.keys(def.decks).length} decks`);
}
process.exitCode = bad ? 1 : 0;
