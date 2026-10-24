# AI test clips

A small set of your own skate clips with the answers you expect. Run it after
changing the AI instructions (`server/services/analysisPrompt.ts`), the model,
the frame rate, or the response format, to check that accuracy did not get
worse.

## Set up (once)

1. Put 5–8 short clips in `eval/clips/`. Each must be under 30 seconds and
   4 MB (`.mp4`, `.webm`, or `.mov`). Only use footage you have permission to
   use. These files stay on your computer; Git ignores this folder.
2. Aim for a mix:
   - a clean, landed trick (e.g. an ollie)
   - a flip trick (kickflip, heelflip, shuvit)
   - a grind or slide on a rail or ledge
   - a bail or missed trick
   - blurry, dark, or partly blocked footage
   - a clip with no skateboarding at all
3. Edit `eval/cases.json`. Replace the three examples with one entry per clip:

   ```json
   {
     "file": "kickflip-bail.mp4",
     "notes": "Kickflip attempt, board flips but I fall off",
     "expect": { "verdict": "analyzed", "trick": "kickflip", "landed": "no" }
   }
   ```

   - `file`: the clip's file name in `eval/clips/`
   - `notes`: what actually happens, in your own words
   - `expect`: only the things you are sure about (all optional):
     - `verdict`: `"analyzed"`, or `"insufficient_evidence"` when the AI should
       say it cannot tell (no skating, too blurry)
     - `trick`: the trick name, or `"none"` if it should not name one
     - `landed`: `"yes"`, `"no"`, or `"unclear"`

## Run it

Check your clips and the cases file without using any Gemini quota:

```bash
npm run eval -- --dry-run
```

Run the full check (uses one Gemini request per clip from your daily quota):

```bash
npm run eval
```

Run just one clip, for example every file with "ollie" in its name:

```bash
npm run eval -- --only ollie
```

Each clip shows ✅ or ❌ for every expectation, plus the AI's summary so you can
judge the coaching too. Full answers are saved in `eval/results/` (not
committed) so you can compare runs before and after a change.

## Limits of this check

A handful of clips cannot prove the AI is accurate in general. It catches
obvious regressions ("fixing kickflips broke ollies"), not every mistake. The
AI's wording changes between runs; only the trick, landing, and verdict are
compared.
