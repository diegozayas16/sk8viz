import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { ACCEPTED_VIDEO_TYPES, ANALYSIS_LIMITS, type AcceptedVideoType } from '../shared/analysis/limits.ts';
import { loadConfig } from '../server/config.ts';
import { matchesVideoSignature } from '../server/readBody.ts';
import { createGeminiAnalyzer } from '../server/services/gemini.ts';
import type { AnalyzerOutcome } from '../server/types.ts';
import { compareResult, EvalCasesSchema, type Check, type EvalCase } from './compare.ts';

// Live model evaluation against eval/cases.json. Uses one Gemini request per
// clip (plus a fallback request when the main model is busy or out of quota),
// so it is run by hand, never by `npm test`.
//
//   npm run eval                 run every clip
//   npm run eval -- --dry-run    check clips and the cases file, no Gemini calls
//   npm run eval -- --only ollie run clips whose file name contains "ollie"

const EVAL_DIR = 'eval';
const CLIPS_DIR = join(EVAL_DIR, 'clips');
const PAUSE_BETWEEN_CLIPS_MS = 2000;

const EXTENSION_TYPES: Record<string, AcceptedVideoType> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

interface ClipRun {
  file: string;
  notes: string;
  checks: Check[];
  outcome: AnalyzerOutcome | { ok: false; code: 'clip_problem'; detail: string };
  seconds?: number;
}

function parseArgs(argv: string[]) {
  const onlyIndex = argv.indexOf('--only');
  return {
    dryRun: argv.includes('--dry-run'),
    only: onlyIndex >= 0 ? (argv[onlyIndex + 1] ?? '').toLowerCase() : null,
  };
}

// Returns the clip bytes and upload type, or a reason it cannot be sent.
async function loadClip(file: string): Promise<{ bytes: Uint8Array; type: AcceptedVideoType } | { problem: string }> {
  const path = join(CLIPS_DIR, file);
  const info = await stat(path).catch(() => null);
  if (!info) return { problem: 'not found in eval/clips/' };
  if (info.size > ANALYSIS_LIMITS.maxClipBytes) {
    return { problem: `${(info.size / 1024 / 1024).toFixed(1)} MB is over the ${ANALYSIS_LIMITS.maxClipBytes / 1024 / 1024} MB limit` };
  }
  const type = EXTENSION_TYPES[extname(file).toLowerCase()];
  if (!type) return { problem: 'use a .mp4, .webm, or .mov file' };
  const bytes = new Uint8Array(await readFile(path));
  if (!matchesVideoSignature(type, bytes)) return { problem: `does not look like a real ${extname(file)} video` };
  return { bytes, type };
}

function printRun(index: number, total: number, run: ClipRun) {
  console.log(`\n[${index}/${total}] ${run.file}${run.notes ? ` — ${run.notes}` : ''}`);
  if (!run.outcome.ok) {
    console.log(`  ⚠️  ${run.outcome.code}: ${run.outcome.detail}`);
    return;
  }
  for (const check of run.checks) {
    const mark = check.pass ? '✅' : '❌';
    console.log(`  ${mark} ${check.field}: expected "${check.expected}", got "${check.actual}"`);
  }
  if (run.checks.length === 0) console.log('  (no expectations set; review the answer below)');
  const { trick, summary } = run.outcome.result;
  console.log(`  model ${run.outcome.model ?? '?'} · ${run.seconds?.toFixed(1)}s · confidence ${trick.confidence}`);
  console.log(`  AI said: ${summary}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = EvalCasesSchema.parse(JSON.parse(await readFile(join(EVAL_DIR, 'cases.json'), 'utf8')));
  const selected = args.only ? cases.filter((c) => c.file.toLowerCase().includes(args.only ?? '')) : cases;
  if (selected.length === 0) {
    console.log('No cases selected. Check eval/cases.json or the --only filter.');
    return;
  }

  if (args.dryRun) {
    console.log(`Dry run: ${selected.length} case(s), no Gemini requests.\n`);
    for (const evalCase of selected) {
      const clip = await loadClip(evalCase.file);
      console.log(`${'problem' in clip ? '⚠️ ' : '✅'} ${evalCase.file}${'problem' in clip ? ` — ${clip.problem}` : ''}`);
    }
    return;
  }

  const config = loadConfig();
  if (!config.apiKey) throw new Error('GEMINI_API_KEY is not set. Add it to .env first.');
  const analyze = createGeminiAnalyzer(config.apiKey, config.model, config.fallbackModel);
  console.log(`Evaluating ${selected.length} clip(s) with ${config.model} (fallback ${config.fallbackModel ?? 'none'}).`);
  console.log(`This uses at least ${selected.length} Gemini request(s) from your daily quota.`);

  const runs: ClipRun[] = [];
  for (const [index, evalCase] of selected.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_CLIPS_MS));
    const run = await evaluate(evalCase, analyze);
    runs.push(run);
    printRun(index + 1, selected.length, run);
  }

  const passed = runs.filter((r) => r.outcome.ok && r.checks.every((c) => c.pass)).length;
  const errored = runs.filter((r) => !r.outcome.ok).length;
  console.log(`\nResult: ${passed}/${runs.length} clip(s) matched every expectation${errored ? `, ${errored} could not be analyzed` : ''}.`);

  await mkdir(join(EVAL_DIR, 'results'), { recursive: true });
  const resultsFile = join(EVAL_DIR, 'results', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(resultsFile, JSON.stringify({ model: config.model, fallbackModel: config.fallbackModel, runs }, null, 2));
  console.log(`Full answers saved to ${resultsFile} (not committed).`);

  if (passed < runs.length) process.exitCode = 1;
}

async function evaluate(evalCase: EvalCase, analyze: ReturnType<typeof createGeminiAnalyzer>): Promise<ClipRun> {
  const base = { file: evalCase.file, notes: evalCase.notes, checks: [] };
  const clip = await loadClip(evalCase.file);
  if ('problem' in clip) return { ...base, outcome: { ok: false, code: 'clip_problem', detail: clip.problem } };

  const started = performance.now();
  const outcome = await analyze({
    bytes: clip.bytes,
    mimeType: ACCEPTED_VIDEO_TYPES[clip.type],
    signal: AbortSignal.timeout(ANALYSIS_LIMITS.analysisTimeoutMs),
  });
  const seconds = (performance.now() - started) / 1000;
  return { ...base, outcome, seconds, checks: outcome.ok ? compareResult(evalCase.expect, outcome.result) : [] };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
