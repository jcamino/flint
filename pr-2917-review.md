# Code Review — flint PR #2917

**`feat(typescript-language): tag scope variables with definition kind`**
Author: kovsu · Base: `flint-fyi:main` · Head: `kovsu:pr-scope-defs` · 1 commit · +90/−11 across 5 files · approved by michaelfaith

> **Verdict: Ready to merge — Yes.** Correct, type-safe, well-scoped, tests + typecheck pass, merges cleanly.
> The only feedback is optional test coverage and forward-looking notes.

---

## What it does

Adds a `defs: ScopeDefinition[]` array to every `ScopeVariable`, tagging each binding with how it was declared (`variable | parameter | catch | function | class | import`).
Without it, structurally identical bindings (a `catch` param and a normal variable are both an `Identifier` on a `VariableDeclaration`) force consumers to re-walk the AST to classify them.
This centralizes classification at the one point where it's free — the `collectDeclarations` switch already branches on node kind.
Unblocks the `shadows` rule (#2007).

## Verification (run locally against PR head `fe57e956`)

| Check                                | Result                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest run … scopeManager.test.ts`  | **26/26 pass** (incl. new test)                                                                                                                 |
| `tsc --noEmit -p tsconfig.json`      | **clean (exit 0)**                                                                                                                              |
| `git merge-tree origin/main pr-2917` | **0 conflicts** — rebases cleanly past `chore!: tighten public api (#2731)`, which landed on `main` after this branch and also edits `index.ts` |
| `ScopeVariable` construction sites   | **1** (`scopeManager.ts:117`), correctly updated with `defs: []`                                                                                |
| Completeness                         | `kind` is a **required** param on `addVariable`/`addBindingName`, so the compiler guarantees no call site is left untagged                      |

## Strengths

- **Right layer, right time.** Classification is captured where it's already known (the switch), not re-derived.
`node`/`identifier` carried on each def lets consumers locate the declaration.
- **Genuinely non-breaking.** `declarations` is retained (still consumed at `getModifyingReferences.ts:13`); `defs` is purely additive.
`tsc` confirms nothing else breaks.
- **No double-tagging — a real correctness subtlety handled correctly.** A `VariableDeclaration` whose parent is a `CatchClause` early-returns at `scopeManager.ts:199` before the `"variable"` path, so a caught binding is tagged **only** `"catch"`.
Easy to get wrong; this PR gets it right.
- **`defs` is non-optional**, so consumers never face `undefined`.
`createScope` seeds no variables, so the invariant "every variable has ≥1 def" provably holds.
- **Faithful, simplified mirror of `@typescript-eslint`.** Its `DefinitionType` has 11 members; the 6 here map 1:1 onto `CatchClause`/`ClassName`/`FunctionName`/`ImportBinding`/`Parameter`/`Variable`.
The omitted five are all TS type-space kinds flint's scope manager doesn't track yet (see Further work).
- Compact test fixture exercises all six kinds in one source file.

## Issues

### Critical

None.

### Important (low risk) — untested distinct branches

The new test is good but covers one branch per kind.
Two cases are _separate code paths_, not just repetition, and are cheap to add:

1. **Only the default import is tested for `"import"`.** `addImportVariables` has three distinct branches — default clause (`scopeManager.ts:75`), namespace `import * as ns` (`:84`), and named `import { x }` (`:93`).
Only the first is asserted.
*Fix:* add `import * as ns` and `import { named }` to the fixture.
2. **Binding-pattern recursion is unasserted.** Threading `kind` through nested destructuring (`addBindingName`, `:59`) is the one new piece of _logic_ (vs. literal args).
*Fix:* assert `const { a } = o` → `"variable"` and `function f({ x }) {}` → `"parameter"`.

Risk is low — each `kind` is a hardcoded literal and `tsc` enforces presence — so these are "should-add," not merge blockers.

### Minor

- **`declarations` is now fully derivable** from `defs.map(d => d.identifier)` — they're pushed in lockstep in `addVariable` and nowhere else.
Two parallel arrays are a (small) desync hazard and extra allocation, which sits awkwardly with the file's existing allocation-reduction TODOs (`types.ts:35`).
Acceptable for non-breaking now; see Recommendations.
- **`def.node` granularity for imports.** Every binding from one `import` statement shares `node = ImportDeclaration` (`:75`/`:84`/`:93`), whereas `@typescript-eslint` points at the specific specifier.
Consumers can still disambiguate via `def.identifier`, but it's coarser than the mirror implies.
- **Field naming drift.** `ScopeDefinition.identifier` corresponds to eslint's `Definition.name`; "mirroring" is conceptual, not name-for-name.
Fine — just worth not over-claiming.
- **Changeset `patch` for a `feat`** (`cuddly-scopes-defs.md`): appropriate at `0.18.2` (additive, pre-1.0), noted only for completeness.

## Alternatives considered

- **Reviewer's hesitation ("iffy on creating new Kind types").** The string-literal union is the right call: ergonomic to match/serialize, and it deliberately _doesn't_ leak TS's numeric `SyntaxKind` (which would also fail to distinguish a `catch` binding from a plain variable — the very problem being solved).
Reusing eslint's enum would pull in a dependency for six strings.
No better option exists at this size; the hesitation is unwarranted.
- **Store vs. derive.** Deriving kind lazily would reintroduce the AST re-walk this PR exists to remove.
Storing at creation is correct.
- **Single `kind` field vs. `defs[]` array.** The array mirrors eslint and is forward-correct: merged declarations (`function f(){}; var f` → `["function","variable"]`) legitimately carry multiple defs of differing kinds.
Today that's rare (flint doesn't track namespace/enum merging), so defs are almost always length 1 — but the array is the right shape for the future.

## Further work

- **Extend `ScopeDefinitionKind` to TS type-space** (`enum`, `namespace`/module, `type`/`interface`, type parameters, enum members) once `collectDeclarations` tracks them.
These aren't in the switch at all today, so those bindings are absent from the scope manager — a pre-existing gap, not introduced here.
- **`shadows` (#2007) dependency.** `no-shadow`'s `ignoreTypeValueShadow` / `ignoreFunctionTypeParameterNameValueShadow` options require distinguishing _type_ bindings — which needs a `type` kind that doesn't exist yet.
The value-space options (`hoist`, `allow`) are unblocked now; the type-aware ones depend on the bullet above.
Worth confirming on #2007's scope.
- **Document multi-def semantics** for consumers (which def governs when kinds differ?) and add a redeclaration test to lock the behavior in.
- **Consider deprecating `declarations`** in favor of `defs` (or making it a derived getter) in a future major, removing the dual-array duplication.

## Assessment

**Ready to merge: Yes.** A focused, type-safe, correctly-implemented addition that does exactly what it claims, with a clean rebase path and passing tests/typecheck.
The Important items are low-risk test additions worth doing but not blocking; the rest are forward-looking notes for the `shadows` follow-up.
