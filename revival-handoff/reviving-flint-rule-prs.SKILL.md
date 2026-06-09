---
name: reviving-flint-rule-prs
description: >-
  Use when reviving, migrating, or finishing one of the stale draft "feat:
  implement <rule>" pull requests in the flint-fyi/flint linter. Triggers: a
  flint draft rule PR that is failing CI or marked status:blocked; a rule that
  uses the old API (typescriptLanguage.createRule(...), context.typeChecker,
  about.preset); or working through the flint draft-rule backlog. flint-specific.
---

# Reviving Flint draft rule PRs

## Overview

`flint-fyi/flint` has ~25 stale **draft PRs that each implement one lint rule**.
They froze (≈Jan–Feb 2026) not because they were wrong, but because the **rule-authoring API migrated underneath them**.
Reviving one = port its rule to the current API, restore tests/docs/comparisons/changeset, pass the gates, push a branch to the fork, and open a **draft PR** against upstream `flint-fyi/flint`.

This recipe is battle-tested: `#477 variableBlockScopeUsage` and `#479 unusedLabels` were revived and pushed with it (see git log on `jcamino/flint`).

## Constraints (the rules of this effort)

- Push each revived rule as its own branch **`revive/<n>-<rule>`** to the **`fork`** remote (`github.com/jcamino/flint`), then open a **draft PR** against upstream `flint-fyi/flint` (base `main`, head `jcamino:revive/<n>-<rule>`).
See _Open the draft PR_.
PRs are opened as **draft** deliberately — they're for maintainer review, not an assertion of merge-readiness.
- Work **oldest PR number first** unless told otherwise.
- Don't guess on semantics: if a PR is gated on a maintainer **design decision** (not a code gap), revive it to green-CI and **flag the open question** rather than inventing behavior.
- **Maintainability is part of the deliverable** (Javier's explicit ask): "preserve behavior" applies to design _decisions_ pending maintainer input — it is NOT a license to ship sloppy inherited code.
While porting, check the rule against its mature reference implementation (see _Reference clones_) for missed edge cases (e.g. `AggregateError`'s 3rd-arg options, shorthand `{ cause }`, closure references, label shadowing — all real misses found in review of #2944–#2948), remove dead code, and keep helpers small and intelligible.
Where you fix an inherited bug or consciously diverge from the reference, **disclose the delta in the PR body**.

## Setup (once per environment)

```bash
# remotes: origin = upstream, fork = yours
git remote -v                                            # expect: origin git@…flint-fyi/flint ; fork …jcamino/flint
git remote add fork https://github.com/jcamino/flint.git # if missing

corepack enable # Node >=24; gives pnpm
pnpm install
# Recommended so `pnpm run flint` is clean (see Gotchas → env noise):
pnpm run build
pnpm run --filter=site prebuild
```

On Linux/WSL `pnpm` is on PATH — use it directly.
(On the old Windows box it wasn't: there you had to use `corepack pnpm …` from PowerShell with `$env:COREPACK_ENABLE_DOWNLOAD_PROMPT='0'`.
WSL removes that friction.)

## Per-PR workflow

1. **Branch fresh from upstream main** (avoids the perpetual rebase conflicts).
Placeholders are written `$N` / `$RULE` / `$PLUGIN` because prettier mangles angle-bracket placeholders in this file:
   ```bash
   git fetch origin
   git checkout -b "revive/$N-$RULE" origin/main
   ```
2. **Pull only the PR's NEW files** (rule + test + docs) — _not_ `plugin.ts`/`data.json`, which always conflict and which you re-apply by hand.
If upstream still has the PR's head branch (`gh pr view $N --json headRefName`), the simplest form is:
   ```bash
   git fetch origin "$HEAD_BRANCH"
   git checkout "origin/$HEAD_BRANCH" -- \
   	"packages/$PLUGIN/src/rules/$RULE.ts" \
   	"packages/$PLUGIN/src/rules/$RULE.test.ts" \
   	"packages/site/src/content/docs/rules/$PLUGIN/$RULE.mdx"
   git restore --staged "packages/$PLUGIN/src/rules/$RULE.ts" \
   	"packages/$PLUGIN/src/rules/$RULE.test.ts" \
   	"packages/site/src/content/docs/rules/$PLUGIN/$RULE.mdx"
   ```
   (Otherwise `git fetch origin "pull/$N/head"` and checkout from `FETCH_HEAD`.)
   **Fallback** if this errors `unable to read sha1 file` (blobless partial clone):
   ```bash
   SHA=$(gh pr view "$N" --repo flint-fyi/flint --json headRefOid --jq .headRefOid)
   for f in "${PATHS[@]}"; do # the 3 paths above
   	gh api "repos/flint-fyi/flint/contents/$f?ref=$SHA" \
   		-H "Accept: application/vnd.github.raw" > "$f"
   done
   ```
3. **Port the rule** to the current API — see _Migration recipe_.
(You may delegate this to a subagent; always re-verify the gates yourself.)
4. **Re-apply the hot files + changeset** — see _Merge-ready checklist_.
5. **Run every gate** (see _Gates_) until green.
6. **Commit + push to fork** (see _Commit & push_).
7. **Open a draft PR** against upstream `flint-fyi/flint` (see _Open the draft PR_).

## Migration recipe (OLD → NEW rule API)

This is the heart of why drafts went stale.
For a **TypeScript-plugin** rule (`packages/ts`, most of the backlog):

- **Imports**
  - `import ts from "typescript";` ← default import, not `import * as ts`
  - `import { typescriptLanguage } from "@flint.fyi/typescript-language";` ← **not** `../language.ts`
  - `import { ruleCreator } from "./ruleCreator.ts";`
  - `getTSNodeRange`, `type AST`, `type Checker`, `type TypeScriptFileServices` also come from `@flint.fyi/typescript-language`.
Use `import { type AST }` (not `import * as AST`).
- **Every relative import specifier uses `.ts`, NEVER `.js`** — including the test file (`./ruleTester.ts`, `./<rule>.ts`).
eslint `no-restricted-syntax` fails on `.js`.
- **Constructor:** `typescriptLanguage.createRule({ … })` → `ruleCreator.createRule(typescriptLanguage, { … })`.
- **Preset:** `about.preset: "x"` (string) → `about.presets: ["x"]` (array).
Valid `ts` presets: `javascript`, `logical`, `logicalStrict`, `stylistic`, `stylisticStrict`.
**Get the value from the rule's existing `comparisons/src/data.json` entry** (it's there as a backlog stub).
- **Type info & source file are no longer on `context`.** They arrive as the visitor's 2nd `services` arg:
  ```ts
  SomeNode: (node, { sourceFile, typeChecker }) => { … }
  ```
  Replace `context.typeChecker` / `context.sourceFile` accordingly.
**`context.report(...)` stays on `context`.**
- **`:exit` listeners are supported now** (visitor key `"Node:exit"`; issue #1163 closed).
Rules that eagerly walked `context.sourceFile` inside `setup()` (impossible now) must be re-architected to visitors + an `:exit` pass.
Example: #479 tracks labels with a stack pushed on `LabeledStatement`, marked used by `break`/`continue`, reported on `LabeledStatement:exit`.
- **Other plugins:** same shape, but import that plugin's language + `ruleCreator`.
`node`/`plugin-node` rules use their own language; **JSON & package-json** rules use the momoa-based `@flint.fyi/json-language/new` (different AST: `node.type === "Object"|"Member"|…`, one-arg `getJsonNodeRange(node)`).
The vast majority of the backlog is `ts`.

There must be **zero** remaining `context.typeChecker` / `context.sourceFile` references and **zero** `.js` relative specifiers after porting.

## Merge-ready checklist (3 files + 3 edits)

Create:

- `packages/<plugin>/src/rules/<rule>.ts`
- `packages/<plugin>/src/rules/<rule>.test.ts`
- `packages/site/src/content/docs/rules/<plugin>/<rule>.mdx` — frontmatter **must include `topic: "rules"`** (required by the site's starlight-sidebar-topics content schema; old drafts predate it and its absence kills the Netlify deploy-preview in ~30s with no useful check output).
Compare against any current rule doc.

Edit:

- `packages/<plugin>/src/plugin.ts` — import the rule + add to the `rules` array **alphabetically** (`flint/pluginRuleOrdering` enforces).
- `packages/comparisons/src/data.json` — the rule's entry already exists; add `"status": "implemented"` to its `flint` object.
**Do not add a new entry.**
- `.changeset/<rule-kebab>.md` — prose body (see Gotchas).

## Gates (from repo root; iterate until all green)

```bash
pnpm exec eslint packages/<plugin>/src/rules/<rule>.ts \
  packages/<plugin>/src/rules/<rule>.test.ts \
  packages/<plugin>/src/plugin.ts --max-warnings 0
pnpm exec tsc -b packages/<plugin>          # REAL typecheck — vitest does NOT typecheck
pnpm vitest run packages/<plugin>/src/rules/<rule>.test.ts
pnpm exec prettier --write <rule.ts> <test.ts> <mdx> && pnpm exec prettier --check <same 3>
pnpm run flint                              # optional; needs build + site prebuild to be noise-free
```

## Gotchas (each observed for real on #477/#479)

| Symptom                                                                                                                                                                                       | Fix                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| eslint `no-restricted-syntax`: ".js file extension in import; please use .ts"                                                                                                                 | Use `.ts` in ALL relative imports — rule **and** test file.                                                                                                                                                                  |
| pre-commit fails: "Changesets should be human-readable. Do not use conventional commit prefixes."                                                                                             | Changeset **body** = sentence case + ending period, **no** `feat(...)`: e.g. ``Implement the `unusedLabels` rule.`` The git **commit message** stays conventional (`feat(ts): implement <rule> rule`). Two different things. |
| `pnpm run flint` shows 30+ `ts/anyMemberAccess` in `packages/site/*` & `comparisons/src/getRuleForPlugin.ts`, plus "Cannot find module '@flint.fyi/core' / 'astro:content' / '\*.module.css'" | **Environmental**, not your rule — workspace/site types weren't built. Run `pnpm run build` + `pnpm run --filter=site prebuild`, or just confirm none of the reports name _your_ files.                                      |
| flint: "Prettier formatting differences" on your rule/mdx                                                                                                                                     | `pnpm exec prettier --write` them.                                                                                                                                                                                           |
| vitest passes but the rule has type errors                                                                                                                                                    | vitest uses esbuild (strips types). **Always** run `tsc -b`.                                                                                                                                                                 |
| fixtures use `console`/`fetch`/DOM globals; rule-tester (post-#2900) flags them                                                                                                               | Switch the test import from `ruleTester` to `domLibRuleTester` (both exported from `./ruleTester.ts`).                                                                                                                       |
| rule needs whole-file/scope analysis but `sourceFile` is only in visitors                                                                                                                     | Collect across visitors + report on `:exit` (e.g. a stack).                                                                                                                                                                  |
| `git checkout FETCH_HEAD -- …` errors "unable to read sha1 file"                                                                                                                              | Blobless clone — use the `gh api … raw` fallback in step 2.                                                                                                                                                                  |

## Commit & push

```bash
git add <the 3 new files> packages/<plugin>/src/plugin.ts packages/comparisons/src/data.json .changeset/<rule-kebab>.md
git commit -m "feat(<plugin>): implement <rule> rule" \
  -m "Revives #<n>, porting it to the current ruleCreator/services API. Includes rule, tests, docs, comparisons entry, and a changeset." \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push -u fork revive/<n>-<rule>
```

Let husky/lint-staged run (it runs prettier + `validate-changesets.ts`).

## Open the draft PR

After the branch is on `fork`, open a **draft** PR against upstream (the head lives on the fork; gh references it as `jcamino:BRANCH`).
Placeholders are written `$N` / `$RULE` / `$PLUGIN` because prettier mangles angle-bracket placeholders in this file:

```bash
gh pr create --repo flint-fyi/flint --base main \
	--head "jcamino:revive/$N-$RULE" \
	--title "feat($PLUGIN): implement $RULE rule" \
	--body-file "/tmp/pr-$N-body.md" --draft
```

**The body MUST start with the repo's PR-template checklist** — the `octoguide` CI gate (strict config; applies to CONTRIBUTOR-association authors) fails otherwise:

- `pr-linked-issue` requires a literal **`fixes #NNN`** closing link (an "Addresses #NNN" mention does NOT count).
Auto-closing the tracking issue on merge is correct — the revival implements it.
Find it: `gh pr view $N --repo flint-fyi/flint --json body --jq .body | grep -iE "(fixes|closes) #"`.
- `pr-task-completion` requires every template task `[x]`-checked.
**Its matcher is a literal substring check** (whitespace stripped; the template task is cut at its first `:` or `#`): the body must contain `[x]` immediately followed by the task's leading text.
So the docs' `- [x] ~~task~~ explanation` N/A form **fails here** — the `~~` between `[x]` and the text breaks the substring.
Instead keep the task text verbatim and append the honest caveat after it: `- [x] task text — **caveat:** explanation`.
The revival PRs use this for the `status: accepting prs` item, since the backlog issues are labeled `status: blocked`.
- OctoGuide re-runs on PR **body edits** (`pull_request_target: edited`), not on pushes — to clear a stale failure after fixing the body, make any small body edit.
Don't read run conclusions as body verdicts without checking the bot's comment: it also re-runs on every comment create/edit (its own, Netlify's…), and a run "succeeds" when findings merely match the existing comment.
The source of truth is whether its PR comment still lists findings.

Body template (write to a temp file to avoid shell-escaping):

```markdown
## PR Checklist

- [x] Addresses an existing open issue: fixes #TRACKING_ISSUE
- [x] That issue was marked as [`status: accepting prs`](https://github.com/flint-fyi/flint/issues?q=is%3Aopen+is%3Aissue+label%3A%22status%3A+accepting+prs%22) — **caveat:** the issue is labeled `status: blocked` (its original draft, #N, stalled on the legacy rule API) — this PR is the revival of that draft, opened as a draft for maintainer review
- [x] Steps in [CONTRIBUTING.md](https://github.com/flint-fyi/flint/blob/main/.github/CONTRIBUTING.md) were taken

## Overview

> **Draft revival** — opening for maintainer review, not asserting merge-readiness.

Revives #N (`RULE`), which stalled when the rule-authoring API migrated underneath it.
This branch ports it to the current `ruleCreator.createRule(language, …)` + visitor-`services` API and restores the full rule set.

ONE SENTENCE: what the rule reports + its equivalents in other linters.

### Files

- the 3 created files + plugin.ts / data.json / .changeset (one bullet each)

### Local gates

`eslint --max-warnings 0` · `tsc -b packages/PLUGIN` · `vitest` (rule test) · `comparisons/data.test.ts` · `prettier --check` — all pass locally.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Notes:

- If the PR was revived only to green-CI with an **open design question** (see Constraints), call it out under an `## Open questions` heading so maintainers see it before reviewing (see #2946 for the shape).
- Mention any porting change beyond the mechanical recipe (e.g. a lint-driven rewrite) explicitly — reviewers should not have to diff against the original to find it.
- `gh pr edit` fails on this repo with a Projects-classic GraphQL error; edit bodies via REST instead: `gh api "repos/flint-fyi/flint/pulls/$N" -X PATCH -F body=@"/tmp/pr-$N-body.md"`.

## Delegating to a subagent

Give a Sonnet subagent: this skill's **Migration recipe** + **Merge-ready checklist** + **Gates**, scoped to ONE PR, with hard rules: _no git commands_ (orchestrator owns git); derive the preset from the rule's `data.json` entry; self-run the gates until green; report final imports, the preset used, gate exit codes, plugin.ts neighbors, the data.json change, and the changeset contents.
Then re-verify the gates yourself before committing.

## The backlog (oldest-first; ✅ = done)

✅ **477** variableBlockScopeUsage · ts → draft PR [#2944](https://github.com/flint-fyi/flint/pull/2944)
✅ **479** unusedLabels · ts → draft PR [#2945](https://github.com/flint-fyi/flint/pull/2945)
✅ **1357** awaitThenable · ts → draft PR [#2946](https://github.com/flint-fyi/flint/pull/2946) (open design Qs — naming, `any`/`unknown` handling, aggregators, fixer — flagged in the PR body, behavior preserved)
✅ **1363** caughtErrorCauses · ts → draft PR [#2948](https://github.com/flint-fyi/flint/pull/2948) (its #400 scope-manager blocker has LIFTED — #400 closed 2026-06-06; lenient behavior preserved, scope-based tightening offered as follow-up)
✅ **1502** floatingPromises · ts → draft PR [#2949](https://github.com/flint-fyi/flint/pull/2949) (Kirk’s design feedback — drop `.catch()`/`void` silencing, sequence-expression gap, `getNumberIndexType` — flagged in the PR body, behavior preserved)
✅ **1504** functionDefinitionScopeConsistency · ts → draft PR [#2950](https://github.com/flint-fyi/flint/pull/2950) (#400 blocker lifted; hand-rolled scope walk preserved, ScopeManager rewrite offered as follow-up)

| PR   | rule                           | plugin          | note                                                                         |
| ---- | ------------------------------ | --------------- | ---------------------------------------------------------------------------- |
| 1505 | functionTypeDeclarations       | ts              | needs migration                                                              |
| 1587 | importAssignments              | ts              | needs migration                                                              |
| 1589 | importSelf                     | ts              | **blocked on #2791** (ProjectService) — verify; likely skip                  |
| 1710 | irregularWhitespace            | **yaml**        | **blocked on #1110**; different language pkg                                 |
| 1722 | unpublishedImports             | **node**        | green CI                                                                     |
| 1742 | unsupportedNodeAPIs            | **plugin-node** | large                                                                        |
| 1745 | constVariables                 | ts              | green CI, small — easy win                                                   |
| 1753 | methodSignatureStyles          | ts              | needs migration                                                              |
| 1770 | invalidThis                    | ts              | green CI                                                                     |
| 1793 | nonNullAssertions              | ts              | needs migration                                                              |
| 1903 | parameterPropertyAssignment    | ts              | needs migration                                                              |
| 2109 | setHasExistenceChecks          | ts              | needs migration                                                              |
| 2112 | shadows                        | ts              | needs migration                                                              |
| 2116 | strictBooleanExpressions       | ts              | **already new API** — only rebase conflicts + a maintainer scope/naming call |
| 2123 | templateExpressionValues       | ts              | needs migration                                                              |
| 2133 | typeConstituentDuplicates      | ts              | small                                                                        |
| 2134 | typeExports                    | ts              | green CI, small — easy win                                                   |
| 2136 | unboundMethods                 | ts              | needs migration                                                              |
| 2138 | unifiedSignatures              | ts              | large                                                                        |
| 2249 | unnecessaryUndefinedDefaults   | ts (copilot)    | **gated on naming #2802** (`unnecessary*`)                                   |
| 2251 | unnecessaryTemplateExpressions | ts (copilot)    | naming #2802; 5 failing jobs                                                 |
| 2259 | unnecessaryLogicalComparisons  | ts (copilot)    | naming #2802                                                                 |

**Skip / flag-for-human until upstream resolves:** 1589 (#2791), 1710 (#1110), 2249 / 2251 / 2259 (#2802).
If you want quick clean wins instead of strict oldest-first, the green-CI bucket is: **2134, 1745, 1770, 1722, 2116**.

## Key reference files

- `packages/ts/src/rules/forInArrays.ts` — canonical current type-aware rule (copy its import style).
- `packages/ts/src/rules/ruleCreator.ts` — valid presets.
`packages/ts/src/rules/ruleTester.ts` — `ruleTester` + `domLibRuleTester`.
- `packages/ts/src/plugin.ts`, `packages/comparisons/src/data.json` (+ `data.test.ts`, `schemas.ts`).
- `.github/workflows/ci.yaml` — exact gate commands.
`packages/site/src/content/docs/project/development.mdx` — "Writing a New Rule".
- Background analysis: the `flint-ai-review` report (direction, backlog buckets, coverage, worked playbooks).

## Reference clones (consult while porting)

Shallow clones of the upstream linters live next to this repo; flint's per-rule issues link the exact reference rules:

- `/home/jcamino/typescript-eslint` — rules in `packages/eslint-plugin/src/rules/`, shared helpers in `packages/eslint-plugin/src/util/` (e.g. `needsToBeAwaited.ts`), tests in `packages/eslint-plugin/tests/rules/`.
- `/home/jcamino/eslint` — rules in `lib/rules/`, tests in `tests/lib/rules/`.

Use them to verify edge-case behavior before declaring a port done; the flint rule doesn't have to match feature-for-feature, but every divergence should be deliberate and disclosed.
(`git -C <clone> pull` to refresh; they're `--depth 1`.)
