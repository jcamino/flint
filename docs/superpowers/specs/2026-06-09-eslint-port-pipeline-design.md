# ESLint→Flint rule-porting pipeline — design

**Date:** 2026-06-09 · **Status:** approved pending user review · **Branch:** `docs/revival-handoff`

## Context & goal

Demonstration engagement for Josh (flint maintainer): show well-crafted, granular rule-implementation PRs — explicitly _not_ AI slop.
Unlike the sibling [revival engagement](../../../revival-handoff/reviving-flint-rule-prs.SKILL.md) (reviving Josh's own stale draft PRs), this pipeline implements rules that have **no prior draft**, porting them from their mature upstream ESLint/typescript-eslint implementations.

Source of truth for the backlog: `packages/comparisons/src/data.json` — entries with an `eslint` property and no `flint.status` (`status` is only ever `implemented` or `skipped`; absence = to-be-implemented).
737 such entries exist across 17 plugins; 28 are excluded because open draft PRs already cover them (revival territory).

## Decisions log (all confirmed with Javier, 2026-06-09)

| Decision                | Choice                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wave-1 scope            | Smallest ~8 ts-plugin rules with on-disk sources (typescript-eslint + core ESLint clones), then check in before scaling                                                                          |
| Ordering                | **Pure LOC order** of the upstream rule source file (tests/docs LOC recorded, not ranked)                                                                                                        |
| Missing tracking issues | **File them first** (5 of the 8 smallest have none), modeled on Josh's `Implement <rule> rule (TypeScript)` issue format; dup-check open+closed under both flint and eslint naming before filing |
| Per-rule git shape      | **Staged commits**: ① verbatim upstream copy (cites repo + SHA + paths) → ② scaffold match → ③ green implementation. **Draft PR opens only when all gates pass**                                 |
| Architecture            | **Serial rule-major pipeline** — one rule lands fully before the next starts; orchestrator owns git/PRs and re-verifies everything                                                               |
| Subagent model          | **Fable (claude-fable-5) at xhigh effort** for all porting subagents — supersedes the revival skill's "Sonnet subagent" note for this engagement                                                 |
| Quality bar             | Gates passing is necessary, never sufficient: code must be **maintainable and follow repo/area conventions** (see _Quality bar_)                                                                 |

## Wave-1 queue (pure LOC order)

| #   | flint rule                   | LOC | upstream source                                      | issue                                                            |
| --- | ---------------------------- | --- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | `unsafeFunctionTypes`        | 51  | `@typescript-eslint/no-unsafe-function-type`         | file new                                                         |
| 2   | `unsafeUnaryNegations`       | 61  | `@typescript-eslint/no-unsafe-unary-minus`           | file new                                                         |
| 3   | `unusedPrivateClassMembers`  | 61  | `@typescript-eslint/no-unused-private-class-members` | file new                                                         |
| 4   | `wrapperObjectTypes`         | 73  | `@typescript-eslint/no-wrapper-object-types`         | file new                                                         |
| 5   | `unsafeDeclarationmerging`   | 75  | `@typescript-eslint/no-unsafe-declaration-merging`   | file new                                                         |
| 6   | `unnecessaryConstructors`    | 76  | `@typescript-eslint/no-useless-constructor`          | #2226 (note naming discussion #2802 in PR body)                  |
| 7   | `restrictedSyntax`           | 77  | core `no-restricted-syntax`                          | #411 (esquery/ESTree-centric — expected defer at estimate stage) |
| 8   | `unnecessaryTypeConstraints` | 119 | `@typescript-eslint/no-unnecessary-type-constraint`  | #2242                                                            |

**Substitution policy:** a `defer` verdict at any stage promotes the next-smallest clean candidate — `promiseRejectErrors` (186, #1822) → `unnecessaryQualifiers` (193, #2233) → `unnecessaryComputedKeys` (205, #2223).
Every defer gets a written rationale in the scoreboard; nothing is silently dropped.

## Deliverables

1. **Manifest generator + backlog table** (`revival-handoff/generate-porting-manifest.mjs` + `porting-backlog.json`) on the `docs/revival-handoff` branch — engagement tooling, never PR'd upstream.
2. **`revival-handoff/porting-eslint-rules-to-flint.SKILL.md`** — durable recipe + scoreboard covering all 44 resolved ts candidates; references (never duplicates) the revival skill's gates/octoguide/PR mechanics.
3. **Up to 5 filed tracking issues** on `flint-fyi/flint`.
4. **8 draft PRs** against `flint-fyi/flint` from the `jcamino` fork, each with the three-stage commit history.
5. **End-of-wave check-in report**: PR table, defers + rationales, filed issues, data-quality finds for Josh (e.g. data.json maps `enumMixedValues` → `@typescript-eslint/no-misused-spread`, an apparent mapping bug), proposed wave-2 slice.
6. Engagement memory: new `flint-porting-engagement` entry linked to `flint-revival-engagement`.

## Component: manifest generator

Small dependency-free Node script, re-runnable for later waves.

- **Inputs:** `data.json`; a clone-roots config (`@typescript-eslint/X` → `~/typescript-eslint/packages/eslint-plugin/src/rules/X.ts`; core `X` → `~/eslint/lib/rules/X.js`; each config entry also carries the source repo's test/docs path conventions, e.g. typescript-eslint `tests/rules/X.test.ts` + `docs/rules/X.mdx`, core `tests/lib/rules/X.js` + `docs/src/rules/X.md`, so stage C knows the full trio; wave-2 sources = one config entry + one `git clone --depth 1`); a cached `gh` issue/PR sidecar JSON so the script stays offline-deterministic.
- **Logic:** filter (has `eslint`, no `flint.status`) → pick one top equivalent (**prefer plugin over core ESLint**) → resolve source file → count LOC → join issue number + status label → attach caveat flags: `open-PR-exists`, `no-issue`, `naming-#2802`, `no-preset/options-driven`, `source-not-cloned`, `mapping-suspect` (no token overlap between flint name and eslint slug — the check that caught `enumMixedValues`).
- **Outputs:** `porting-backlog.json` (work queue) + LOC-ascending markdown scoreboard embedded in the SKILL.md (rule, LOC, source link, issue, preset→presets mapping, caveats, ⬜/🔁/✅ + PR link).
- **Properties:** read-only over `data.json`; unresolvable sources appear flagged at the bottom rather than vanishing.

## Per-rule pipeline (serial, smallest-first)

- **A. Pre-flight.** Re-verify no PR/issue raced the manifest snapshot.
File the tracking issue if missing; record `#NNN`.
- **B. Branch** `port/<issue>-<rule>` from fresh `origin/main`.
- **C. Commit 1 — verbatim copy** (orchestrator, mechanical).
Trio lands unmodified at flint paths: `packages/ts/src/rules/<flintName>.ts`, `…/<flintName>.test.ts`, `packages/site/src/content/docs/rules/ts/<flintName>.mdx`.
Conventional commit message cites upstream repo + commit SHA + original paths (clean MIT attribution; later diffs show exactly what the port changed).
- **D. Difficulty estimate** (gate, recorded in scoreboard).
Rubric: type-checker use, options schema, ESTree↔TS-AST paradigm gap, fixers/suggestions, sibling-util dependency mass.
Verdict `proceed` or `defer + rationale` (→ substitution; branch discarded unpushed).
- **E. Subagent port** — one Fable-xhigh dispatch, **no git allowed**.
  - _Stage 2:_ rework the trio to sibling-rule scaffolding — `ruleCreator.createRule(typescriptLanguage, …)`, `.ts` relative specifiers everywhere, `topic: "rules"` mdx frontmatter, flint rule-tester format — snapshot all three files to `/tmp/<rule>-stage2/`.
  - _Stage 3:_ full implementation to the _Quality bar_ below: presets derived from the rule's data.json entry under the tier doctrine (plain `logical` → `["logical","logicalStrict"]`; + `strictness: "strict"` → strict-only; same for stylistic); edge cases checked against the reference clone; `plugin.ts` wired alphabetically; data.json entry gains `"status": "implemented"`; prose changeset; all gates self-run until green.
  - _Reports back:_ preset mapping, behavior divergences vs upstream, gate outputs, branch→test sensitivity mapping, files touched.
- **F. Orchestrator verification.** Fresh re-run of every gate; maintainability + conventions review against sibling rules and the reference implementation; spot-check test sensitivity (remove ≥1 logic branch, confirm a test fails, restore); sanity-check the stage-2 snapshot (it becomes a public commit).
- **G. Commits 2 & 3.** Tree → snapshot state → commit 2 (scaffold match); restore final state + hot files (plugin.ts, data.json, changeset) → commit 3 (`feat(ts): implement <rule> rule`).
- **H. Push + draft PR.** Push to fork; draft PR per the revival skill's octoguide-compliant template: checklist with literal `fixes #NNN`, honest caveat on the accepting-prs checkbox for freshly-filed issues, provenance section (upstream source @ SHA, staged-commit map), divergence disclosures, gates listed.
Update scoreboard + memory.

## Quality bar (anti-slop core)

1. **Mechanical gates, run twice** (subagent, then orchestrator from clean state): `pnpm exec eslint <files> --max-warnings 0` · `pnpm exec tsc -b packages/ts` · `pnpm vitest run <rule test>` · comparisons data test · `pnpm exec prettier --check` · changeset validation.
2. **Maintainability & conventions** (Javier's explicit bar; gates passing is never sufficient): code reads like its sibling flint rules — import style, naming, helper decomposition, educational "prefer X" message style, test layout per `implementing-lint-rules`; no dead code; no hand-rolled logic where a sibling pattern exists; comment density matching the area.
3. **Test sensitivity:** every logic branch in the rule has a test that fails if the branch is removed; subagent reports the mapping, orchestrator proves at least one per rule.
4. **Behavior parity:** divergence from the upstream rule is allowed only when deliberate, and every divergence is disclosed in the PR body.

## Error handling

- **Subagent can't reach green:** one bounce to a fresh Fable-xhigh subagent with the specific failure; still stuck → orchestrator implements directly; revealed _design_ blocker → defer valve + substitution.
- **Verification finds quality gaps:** fix or bounce with concrete findings — "subagent's gates passed" is not grounds to ship.
- **Octoguide red after PR opens:** body-edit retrigger; the bot's PR comment, not run conclusions, is the verdict (revival-skill gotcha).
- **Netlify preview killer:** missing `topic: "rules"` frontmatter — explicit stage-2 checklist item.
- **Upstream drift mid-wave:** branches cut fresh per rule; hot-file overlaps across the 8 PRs are one-line conflicts at merge time; open drafts are not pre-rebased.
- **Data oddities:** never edited unilaterally — flagged in the check-in for Josh.

## Reporting & cadence

Scoreboard row per rule (⬜→🔁→✅ + PR link) on the docs branch is the single progress truth.
End of wave: check-in report (PR table, defers + rationales, filed issues, data-quality finds, wave-2 proposal: next-smallest 8 + which shallow clones to add).
Hard blockers stop and flag rather than guess — maintainer design calls stay with maintainers.

## Out of scope (this wave)

- Non-ts plugins (vue/svelte/react/astro/… — different language packages) and ts rules sourced from not-yet-cloned plugins (jsdoc 43, import 29, unicorn 20, perfectionist 22, promise 9, regexp 5).
- Parallel-worktree execution (documented as the wave-2+ scale-up path).
- Editing `data.json` mappings or renaming `unnecessary*` rules (#2802) — maintainer territory.

## Skill composition map

`brainstorming` (this spec) → `writing-plans` → `executing-plans`; per rule: `implementing-lint-rules` (acceptance criteria) + `reviving-flint-rule-prs` §Migration/§Gates/§PR-template (mechanics) + `verification-before-completion` (stages F/H); subagent dispatch per `subagent-driven-development` with the no-git contract.
