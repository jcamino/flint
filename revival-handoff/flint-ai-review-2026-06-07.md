# Flint — AI-Assisted Project Review & Rule-Reimplementation Playbook

**Repo:** [`flint-fyi/flint`](https://github.com/flint-fyi/flint) @ `main` (HEAD `7db5a815`) · **Date:** 2026-06-07
**Prepared for:** Josh (maintainer) · **Commissioned by:** Javier Camino (`jcamino`)
**Method:** six parallel Claude research subagents (rule-API contract, draft-PR breadth, 3 PR deep-dives, comparisons coverage, project direction; a perf-harness agent ran but was descoped at the requester's direction).

> **Focus of this report**, per request: where AI coding is highest-leverage for Flint, with a deep dive on **reimplementing existing lint rules** — specifically what it takes to get the backlog of stale draft rule PRs merge-ready.
> Performance benchmarking was explicitly out of scope.

---

## Executive summary

- Flint is a pre-1.0 **"hybrid" linter** for JS/TS and friends (291★, created May 2025, multiple PRs/day from a small core: `michaelfaith`, `kovsu`, `JoshuaKGoldberg`).
Its bet: ergonomic JS/TS-authored rules, **full type information available in every rule**, and **type-aware cross-file caching** for fast incremental re-lint.
- **Rule coverage today: 524 implemented / 563 explicitly skipped / 842 still to implement** (1,929 tracked rules in `packages/comparisons/src/data.json`).
The remaining 842 — led by `ts` (194), `vue` (187), `css` (120), `react` (93) — _is_ the reimplementation opportunity, and it's already enumerated with per-rule cross-references to ESLint/Biome/oxlint/etc.
- There is a **backlog of ~28 draft "implement rule" PRs** (most labeled `status: blocked`, ~20 authored by Josh, a few by `copilot-swe-agent`).
The bulk froze around Jan–Feb 2026. **They didn't rot for lack of correctness — the rule-authoring API migrated underneath them.** Reviving them is now a largely _mechanical, well-specified_ port plus a rebase.
- **Highest-leverage AI work, ranked:** (1) implement the 50 ready-to-go vitest/astro rule stubs (`status: accepting prs`); (2) **revive the stale draft rule PRs** (this report's focus); (3) comparisons-data upkeep; (4) the docs-standardization pass (#2805); with type-system fixes (#2894) and the `ts.*`→AST audit (#2772) as higher-judgment items.
- **What we're executing now** (this engagement): reviving stale draft rule PRs **oldest-first**, each ported to the current API and verified locally (`pnpm test` / `pnpm lint` / `pnpm flint`), pushed as branches to **`jcamino/flint`** — **no upstream PRs opened.**

---

## 1. Flint today & direction

The core linter, CLI, and Volar-based embedded-language support (Astro/Svelte/Vue) are largely feature-complete.
The roadmap gates a public alpha on three things: hitting a rule-count milestone (~700 by end-2026, ~1,000 eventually), shipping the LSP server, and proving the `typescript-go` ("Corsa") hybrid-performance story.
Per Flint's own _State of Flint (Spring 2026)_ post, **Flint is still 100% TypeScript with no native code yet** — the "hybrid/native" headline is aspirational (prototype 2026, real 2027).

Two parallel tracks dominate day-to-day work:

1. **Infrastructure maturation** — migrating the JSON language from a TypeScript-AST shim to a **momoa-based AST** (`michaelfaith`, ~60% done across `package-json` rules); a **TypeScript scope manager** (`kovsu`, recently landed and being extended in #2916/#2917); a drafted **TS 6.0** internal bump (#2780, blocked on one upstream dep).
2. **Rule volume** — 72 open `status: accepting prs` rule stubs (vitest 39, astro 11, …), plus two new-plugin discussions (Playwright #2915, GraphQL #2914).

**Biggest structural risk:** the ~28 blocked draft rule PRs are a graveyard of real, mostly-working rule implementations that predate now-stabilized infrastructure decisions — significant unrealized breadth sitting idle.
A secondary risk is type-safety debt in the rule layer (#2894 visitor types forced behind `@ts-expect-error`; #2711 Flint-vs-`tsc` type divergence; #2772 `ts.*` API usage) that gets more expensive to fix as rule count climbs.

## 2. Biggest initiatives & open issues (grouped)

| Theme                                      | Key issues/PRs                                     | State                                                                         |
| ------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| **JSON → momoa "new language" migration**  | #2852, #2895, #2875–#2886, PRs #2897/#2910–#2913   | Active; endpoint #2895 (promote new language) blocked on migrations finishing |
| **TS scope manager & language maturation** | #2828 (merged), #2916, #2917; #2791 ProjectService | Active; unblocks many type-aware rules                                        |
| **Blocked draft rule PRs**                 | ~28 PRs (#477…#2259)                               | **The focus of §4**                                                           |
| **Rule API correctness**                   | #2894 (visitor types), #2711 (type divergence)     | Open, no clear champion — systemic hazard                                     |
| **TS 6.0 internal bump**                   | #2780 (draft), #2906                               | Blocked on `expressive-code-twoslash` upstream                                |
| **LSP / editor integration**               | PR #2537 (`@flint.fyi/lsp`), prereqs #2766/#2770   | In review; reviewers asked to split                                           |
| **Rule volume (stubs)**                    | vitest ×39, astro ×11, +others (72 total)          | `accepting prs` — mechanical                                                  |
| **Docs standardization**                   | #2805 ("big standardization pass")                 | Deferred until ~700 rules; explicitly contemplates an agent                   |
| **Comparisons data**                       | #2818, PR #2816 (Biome fill-in)                    | Active upkeep                                                                 |
| **Naming / cleanup**                       | #2802 (`unnecessary*`), #2772 (`ts.*`→AST)         | In discussion; gate a family of rules                                         |

## 3. Where AI coding is highest-leverage (ranked)

1. **Implement vitest/astro rule stubs** _(mechanical)_ — 50 self-contained issues, each with a reference implementation and example set, against a stable file pattern.
The single most tractable backlog.
2. **Revive the stale draft rule PRs** _(judgment at the edges, mechanical core)_ — the blockers cited in early-2026 have largely lifted; the port is a deterministic recipe (§4.2).
**This engagement's focus.**
3. **Comparisons-data upkeep** _(mechanical)_ — flip newly-implemented rules to `status: implemented`, add entries for newly-tracked plugins (e.g. eslint-plugin-sdl #2818).
Zod-schema-validated.
4. **Docs standardization pass (#2805)** _(mechanical + edge judgment)_ — apply one canonical rule-doc exemplar across ~300 docs.
5. **Fix Rule Visitor types (#2894)** _(judgment-heavy)_ — remove the `@ts-expect-error` shims via a correct generic parameterization.
High leverage, regression-risky.
6. **Test backfilling** _(mechanical)_ — edge cases (empty files, strict-flag interactions) à la the #2835 empty-file bug.
7. **`ts.*`→AST audit (#2772)** _(judgment-heavy)_ — at minimum produce the location/API/replacement audit that precedes the hybrid-linting work.

---

## 4. Deep dive — the rule-reimplementation track

### 4.1 What "merge-ready" means (the contract)

A mergeable new rule is **3 new files + 3 edits**, passing the full gate set:

**Create**

1. `packages/<plugin>/src/rules/<name>.ts` — the rule
2. `packages/<plugin>/src/rules/<name>.test.ts` — co-located snapshot tests (rule-tester)
3. `packages/site/src/content/docs/rules/<plugin>/<name>.mdx` — docs (with `<RuleEquivalents …/>`)

**Edit** 4. `packages/<plugin>/src/plugin.ts` — register the rule **alphabetically** (`flint/pluginRuleOrdering` enforces) 5. `packages/comparisons/src/data.json` — set the rule's entry `"status": "implemented"` (entry already exists as a backlog stub) 6. `.changeset/<name>.md` — e.g. `"@flint.fyi/ts": patch` (+ `comparisons`, `site`)

**Gates:** `pnpm flint` (Flint dog-foods itself — `flint/*` self-rules), `pnpm lint` (ESLint + tsl), `pnpm lint:knip` (no unused exports/deps), `pnpm test` (Vitest; `console-fail-test` fails on stray `console.*`), spelling, and Prettier.

The current rule shape:

```ts
export default ruleCreator.createRule(typescriptLanguage, {
	about: { description: "…", id: "myRule", presets: ["logical"] },
	messages: { someId: { primary: "…", secondary: ["…"], suggestions: ["…"] } },
	options: {
		/* optional Zod v4 schemas */
	},
	setup(context) {
		return {
			visitors: {
				CallExpression(node, { sourceFile, typeChecker }) {
					// full type info, by default
					context.report({
						message: "someId",
						range: { begin, end } /*, fix, suggestions */,
					});
				},
				"CallExpression:exit"(node, services) {
					/* … */
				}, // :exit now supported (#1163 closed)
			},
		};
	},
});
```

### 4.2 Why the drafts went stale — and the revival recipe

Two API generations exist.
The stale drafts (Jan–Feb 2026 and earlier) were written against the **OLD** one:

| Concern                 | OLD (stale drafts)                                                                                         | NEW (merge-ready today)                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule constructor        | `typescriptLanguage.createRule({…})`                                                                       | `ruleCreator.createRule(typescriptLanguage, {…})`                                                                                              |
| Imports                 | local `../language.ts`, `../getTSNodeRange.ts`, `../types/ast.ts`, `../types/checker.ts` **(all deleted)** | `{ typescriptLanguage, getTSNodeRange, type AST, type Checker }` from `@flint.fyi/typescript-language` + `ruleCreator` from `./ruleCreator.ts` |
| Preset field            | `about.preset: "logical"` (string)                                                                         | `about.presets: ["logical"]` (array)                                                                                                           |
| `ts` import             | `import * as ts`                                                                                           | `import ts from "typescript"`                                                                                                                  |
| AST namespace           | `import * as AST`                                                                                          | `import { type AST }`                                                                                                                          |
| Visitor / report bodies | `(node, { sourceFile, typeChecker }) => context.report({ message, range:{begin,end} })`                    | **unchanged** — bodies port verbatim                                                                                                           |

Plus two non-API chores every revival hits:

- **Rebase conflicts** in `packages/ts/src/plugin.ts` and `packages/comparisons/src/data.json` — these are the two hottest files (59 / 109 commits since the drafts' base).
Conflicts are **positional only** (moved alphabetical neighbors).
Cleanest path: branch fresh from `main`, cherry-pick just the rule's _new_ files, then re-apply the tiny `plugin.ts`/`data.json`/changeset edits.
- **Type-clean fixtures** for the incoming gate **PR #2900** (`assertNoLanguageReports`, still open): the default ts rule-tester compiles `lib: ["esnext"], strict, types: []`, so fixtures using `console`/`fetch`/DOM globals must switch to the exported `domLibRuleTester` or use esnext-clean stand-ins.

**Bottom line:** an agent can mechanically bring a stale TS rule PR to _compiling, passing, conflict-free_.
The non-automatable residue is **semantic** — maintainer decisions on default behavior, scope, and naming.

### 4.3 The backlog — 28 draft rule PRs

Buckets: **A** near-merge (green CI, ~clean) · **B** needs API migration · **C** named blocker (conflict/design/dep) · **D** blocked on `unnecessary*` naming (#2802) · **E** bot-authored cleanup.

| PR   | Rule                               | Author  | CI              | Bucket                           | Effort |
| ---- | ---------------------------------- | ------- | --------------- | -------------------------------- | ------ |
| 2134 | typeExports                        | JKG     | ✅ all pass     | A                                | S      |
| 1745 | constVariables                     | JKG     | ✅              | A                                | S      |
| 2116 | strictBooleanExpressions           | JKG     | ✅              | A (new API already)              | M      |
| 1770 | invalidThis                        | JKG     | ✅              | A                                | M      |
| 1722 | unpublishedImports                 | JKG     | ✅              | A                                | M      |
| 1502 | floatingPromises                   | JKG     | ✅              | C (design)                       | S–M    |
| 1357 | awaitThenable                      | JKG     | ✅ / conflict   | C (design + rebase)              | M      |
| 2133 | typeConstituentDuplicates          | JKG     | Flint/Lint fail | B                                | S      |
| 2138 | unifiedSignatures                  | JKG     | fail            | B                                | L      |
| 2136 | unboundMethods                     | JKG     | Flint fail      | B                                | M      |
| 2123 | templateExpressionValues           | JKG     | fail            | B                                | M      |
| 2112 | shadows                            | JKG     | fail            | B                                | M      |
| 2109 | setHasExistenceChecks              | JKG     | fail            | B                                | M      |
| 1903 | parameterPropertyAssignment        | JKG     | no GHA          | B                                | M      |
| 1793 | nonNullAssertions                  | JKG     | Flint fail      | B                                | M      |
| 1753 | methodSignatureStyles              | JKG     | Flint fail      | B                                | M      |
| 1742 | unsupportedNodeAPIs                | JKG     | fail            | B                                | L      |
| 1587 | importAssignments                  | JKG     | fail            | B                                | M      |
| 1505 | functionTypeDeclarations           | JKG     | fail            | B                                | M      |
| 1504 | functionDefinitionScopeConsistency | JKG     | Flint fail      | B                                | M      |
| 1363 | caughtErrorCauses                  | JKG     | fail            | B                                | M      |
| 1589 | importSelf                         | JKG     | partial         | C (blocked #2791 ProjectService) | L      |
| 1710 | irregularWhitespace                | JKG     | Flint fail      | C (blocked #1110)                | S      |
| 477  | variableBlockScopeUsage            | copilot | no GHA          | C+E (#1163 now closed)           | M      |
| 479  | unusedLabels                       | copilot | no GHA          | C+E (#1163 now closed)           | M      |
| 2259 | unnecessaryLogicalComparisons      | copilot | conflict        | D+E                              | M      |
| 2249 | unnecessaryUndefinedDefaults       | copilot | no GHA          | D+E                              | M      |
| 2251 | unnecessaryTemplateExpressions     | copilot | 5 jobs fail     | D+E                              | L      |

> The uniform `2026-02-02T15:25Z` `updatedAt` across the backlog was a **bulk label operation** (the `status: blocked` triage sweep), **not** code activity — real last-commits range Oct 2025 → Jan 2026.

**Two recommended orderings:**

- **Easiest-first** (best for shipping merges fast): `2134 → 1745 → 2116 → 1770 → 1722 → 1502 → 2133 → 1357`.
- **Oldest-first** (this engagement's directive): `477 → 479 → 1357 → 1363 → 1502 → 1504 → 1505 → 1587 → 1722 → 1742 → 1745 → 1753 → 1770 → 1793 → 1903 → 2109 → 2112 → 2116 → 2123 → 2133 → 2134 → 2136 → 2138`, skipping the hard-blocked (`1589` #2791, `1710` #1110) and naming-gated (`2249/2251/2259` #2802) until their upstream questions resolve.

### 4.4 Coverage scoreboard (sizing the opportunity)

From `packages/comparisons/src/data.json` (1,929 entries): **524 implemented · 563 skipped · 842 backlog (43.6%)**.

| Backlog by Flint plugin      |                                 | Implementation vs other linters (non-skipped) |                        |
| ---------------------------- | ------------------------------- | --------------------------------------------- | ---------------------- |
| ts 194 · vue 187 · css 120   | react 93 · astro 47 · vitest 46 | ESLint 40% (498/…)                            | Biome 67% · oxlint 82% |
| svelte 43 · jsx 27 · next 21 | solid 15 · node 11 · md/json 9  | Deno 87% · Markdownlint 58%                   | Stylelint <1%          |

`ts` + `vue` + `css` are 60% of the remaining work.
Every backlog entry already carries cross-references, so "what to build next" is a data query, not a research task.

### 4.5 Worked revival playbooks (representative)

- **`#1502 floatingPromises`** — _most revival-ready._ No conflict; pure import-remap + `preset→presets` + **one** DOM-global fixture line + changeset.
Automatability **High**.
Only open question: confirm the `BLOCKED` label is just the missing changeset/check, not a design ask.
- **`#1357 awaitThenable`** — small mechanical port + rebase (conflicts in the two hot files) + ~10 DOM-global fixture lines.
Automatability **Med**; gated on a recorded maintainer question (async-iterable defaults, Kirk) — a **two-for-one** with floatingPromises.
- **`#2116 strictBooleanExpressions`** — **already on the new API**; the work is conflict resolution + a maintainer blessing on the deliberately reduced scope/configurability of a notoriously configurable rule.
Automatability **Med-Low** (semantics, not mechanics).

---

## 5. What this engagement is executing now

Per direction: **revive stale draft rule PRs, oldest-first, with Sonnet subagents doing the port, verified locally, pushed to `jcamino/flint` — no upstream PRs opened.**

Per-PR workflow:

1. Branch fresh from `main` (`revive/<n>-<rule>`); pull the PR's _new_ rule/test/doc files (avoid the conflicting `plugin.ts`/`data.json`).
2. Sonnet subagent ports the rule to the current API (§4.2 recipe) and type-cleans fixtures.
3. Re-apply `plugin.ts` registration + `data.json` status + changeset.
4. **Verify locally**: targeted `pnpm test`, then `pnpm lint` + `pnpm flint`.
5. Commit + push to `fork`.
Surface any genuinely-blocked PR (missing infra / open design question) rather than forcing it.

Starting point: **`#477 variableBlockScopeUsage`** (oldest), then `#479 unusedLabels`, then `#1357 awaitThenable` …

---

## Appendix — key references & method

- **Rule contract:** `packages/core/src/types/{rules,reports,visitors,changes}.ts`, `packages/core/src/rules/RuleCreator.ts`; example `packages/ts/src/rules/forInArrays.ts`.
- **Current-API examples to copy:** `forInArrays.ts`, `importEmptyBlocks.ts`, `accessorPairGroups.ts`, `rules/ruleCreator.ts`, `rules/ruleTester.ts`; language surface `packages/typescript-language/src/index.ts`.
- **Process:** `packages/site/src/content/docs/project/development.mdx`; `.github/PULL_REQUEST_TEMPLATE.md`; `packages/comparisons/src/data.json` (+ `schemas.ts`, `data.test.ts`); `.changeset/*`.
- **Hot conflict files:** `packages/ts/src/plugin.ts`, `packages/comparisons/src/data.json`.
- **Incoming gate:** PR #2900 (`assertNoLanguageReports`).
- **Method:** findings synthesized from six parallel Claude subagents (read-only research).
Perf-harness design was produced but descoped from this report at the requester's direction.
