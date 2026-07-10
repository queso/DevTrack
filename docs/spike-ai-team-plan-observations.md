# Spike: /ai-team:plan Pipeline Observations

**Date:** 2026-07-09
**Mission:** M-20260709-001 (fix-event-collection)
**Purpose:** Watch the plan pipeline end-to-end and note improvements, in priority order:
1. **Speed** (without losing quality)
2. **Quality**
3. **Output tuning**

Timeline and findings updated live as the mission plan runs.

## TL;DR Recommendations (post-run)

Planning took ~37 min wall-clock with zero rework. Ranked by expected value:

1. **Reuse the pass-1 Face agent for pass 2** (S4/T3 — proven this run: ~16 min
   including a mid-pass correction, no exploration, and it self-flagged the AC
   ceiling). Change the plan command to SendMessage the live agent.
2. **Seed Face's exploration, don't skip it** (S1+Q1): pass PRD-named touchpoints
   into the pass-1 prompt to cut the ~4.5 min cold start, but keep exploration —
   it caught the dead TS installer and the missing parallel_group primitive.
3. **Make Sosa's preliminary→final report protocol explicit** (T1): overlap is
   worth ~12 min but the orchestrator shouldn't hand-reconcile deltas.
4. **Add a `parallel_group`/file-lock primitive to the board** (Q2): 2 of 5
   waves exist only to serialize shared-file edits — pays off at run time.
5. **Codify Sosa's verify→recommend→ask and ask-early patterns** (Q4/Q5) and its
   exact-replacement-text report format (T4) in sosa.md.
6. **Decide the AC-ceiling rule for refined items** (T2): recommend ceiling
   applies to first pass only, exceeding it post-refinement requires a flag.
7. Small: lightweight API health check instead of full getBoard (S2); drop the
   duplicate orchestrator deps-check (S3); activity tail for live progress (S5).

Post-plan PRD coverage audit (see section below): slicing confirmed correct;
two open gaps before /ai-team:run — add the FR12 Claude-side AC to WI-584
(A1), and decide the PostToolUse dual-registration question (A2, needs Josh).

## Timeline

| Time (approx) | Step | Notes |
|---|---|---|
| 15:54 | Pre-flight checks | ~3s total. CLI version, project ID, API reachability |
| 15:54 | `createMission` | Instant, clean JSON response |
| 15:55 | Face pass 1 spawned | Exploring codebase before creating items |
| 15:56 | +60s check | Zero items created yet — all time so far is codebase exploration |
| 15:58 | +3min check | Still zero items (`data: []` confirmed raw — not a filter issue) |
| 16:00 | +5.5min check | Item creation started: 2 items (WI-577 event types, WI-578 redaction). ~4.5 min of pure exploration before first item |
| 16:02 | +7.5min check | 4 items; first dependency appears (WI-580 → WI-577) |
| 16:05 | Face pass 1 done | ~10 min total. 8 items, deps valid, 5 waves. Split ≈ 45% explore / 55% create |
| 16:05 | Orchestrator deps-check | Confirms Face's own run: valid, ready={577,578,579}, blocked={580..584} — duplicate work (see S3) |
| 16:06 | Sosa spawned | Given Face's flagged questions up front |
| 16:12 | Sosa asks human | 2 questions, pre-verified with recommendations; answered in one round |
| 16:15 | Sosa report done | ~9 min. 2 critical, 5 warnings, 3 judgment calls endorsed, 0 boilerplate |
| 16:15 | Face pass 2 dispatched | Via SendMessage to the SAME Face agent (S4 experiment) — no fresh spawn |
| 16:27 | Sosa FINAL report | Sharper per-item text; deltas forwarded to Face mid-pass (see T1) |
| 16:31 | Face pass 2 done | All refinements applied, WI-585 created, Wave 0 (577/578/579/585) moved to ready |
| 16:35 | Delta reconciliation done | Face applied final-report deltas cleanly; updated WI-585 in place rather than duplicating (flagged the swap unprompted). Board unchanged, deps valid |
| — | **Total plan wall-clock** | **~41 min** (15:54 mission create → 16:35 fully reconciled; board was run-ready at 16:31). Zero rework loops |

## 1. Speed Opportunities

### S1. Face pass-1 cold-start exploration is the long pole (observed)
Face spent its first 60+ seconds exploring the codebase before creating a single
item. The PRD already names the exact touch points (Prisma enum, zod schema in
`web/lib/schemas/`, OpenAPI spec, `cli/`, `hooks/`) — the "Resolved Decisions"
section even documents the three synced enum locations from a prior code-verified
session. **Idea:** the plan command could pass a codebase map (or the relevant
file list) into Face's prompt, or Face could fan out parallel Explore subagents
instead of exploring serially. Best version: PRDs written by `/ai-team:write-prd`
could embed a "code touchpoints" section that Face trusts.

### S2. `getBoard` pre-flight returns the full board (35KB)
The reachability check pulled every item from the *previous* mission just to
prove the API is up. A lightweight `ateam health` / `--limit 1` endpoint would
do. Minor, but it's wasted tokens in every planning session and the output
lands in the orchestrator's context.

### S3. Strictly sequential Face → deps-check → Sosa → Face
Sosa cannot start until Face pass 1 fully finishes. A pipelined variant (Sosa
reviews items as they land in briefings) is tempting but risky — Sosa needs the
whole graph to judge sizing/dependencies. A safer overlap: run deps-check *inside*
Face pass 1's wrap-up (it already does this per its prompt) rather than as a
separate orchestrator step re-running the same command.

### S4. Reuse Face's session for pass 2 instead of spawning fresh
The command spec spawns a brand-new Face for the second pass and compensates for
its amnesia with strict "MCP tools only, no exploration, everything you need is
in Sosa's report" guardrails. But the pass-1 Face agent stays alive and idle —
resuming it hands pass 2 an agent that already knows every item, AC, and
dependency it wrote. Cheaper, faster, and the anti-exploration guardrail becomes
unnecessary rather than enforced. Trying this live in this run.

### S5. Orchestrator polling is blind
The command doc gives no signal for "Face is done" other than the subagent
returning. Fine — but my 60s sleep + item-list poll returned nothing actionable.
If `ateam` had an activity tail (`ateam activity --follow` or since-timestamp),
the orchestrator could give the human live progress instead of silence.

## 2. Quality Opportunities

- The two-pass design (Face → Sosa critique → Face refine) is the core quality
  mechanism. Key thing to watch: does Sosa surface *real* ambiguities or
  boilerplate concerns? Does the human Q&A round-trip earn its latency?

### Q1. Face's exploration paid for itself (counterweight to S1)
Face's report surfaced two things a no-exploration pass would have missed:
(a) `web/lib/hook-installer.ts` is a **second, divergent hook installer** the PRD
never mentions (writes `.claude/hooks/*.sh`, calls the CLI with flags that don't
exist) — flagged for Sosa/human rather than silently scoped; (b) the ateam CLI
has **no `parallel_group` support**, so Face serialized shared-file collisions as
dependencies ({577,580} share the zod schema + OpenAPI spec; {583,584} share
`cli/cmd/hooks.go`). So S1's fix should be *seeding* exploration, not skipping it.

### Q2. Artificial waves from missing parallel_group (speed AND quality)
Two of the five waves exist only because dependencies are the sole collision
primitive. Waves 1 and 4 would flatten if the board supported "same wave,
don't run concurrently" or file-level locking. This inflates mission wall-clock
at /ai-team:run time, not just planning time.

### Q3. Sosa's review earned its latency (evidence)
Sosa did not produce boilerplate concerns. Three concrete catches:
1. **Verified the TS installer is dead code** before asking the human — grepped
   for importers, checked the CLI surface it shells to (flags don't exist),
   noted it reads project.yaml. The human question arrived pre-investigated
   with a recommendation, so it took one click to answer.
2. **Found a real scope gap**: the project.yaml→devtrack.yaml cutover flips the
   shared `FindManifest()` constant, silently changing register/sync/status/
   ideas commands whose test fixtures hardcode project.yaml. WI-579 would have
   broken those tests with no warning. This is exactly the class of blast-radius
   miss a single-pass decomposition ships.
3. Handled the scope gap as a Face instruction without bothering the human —
   good triage between "needs a decision" and "needs a fix."

### Q4. Human Q&A pattern that worked: verify → recommend → ask
Both questions reached Josh with facts verified, options enumerated, and a
recommendation marked. Contrast with the failure mode of asking open-ended
questions early. Worth encoding in Sosa's prompt as a hard rule:
never ask the human a question you haven't first tried to answer from the code.

### Q5. Sosa asked its human questions BEFORE finishing the report
Sosa messaged the two human questions mid-review, then kept working while the
human answered. The Q&A round-trip overlapped with report writing instead of
serializing after it — the answers were already in hand when the report landed.
This should be the documented pattern in sosa.md: ask early, keep reviewing.
(Also a speed win, but it exists to protect quality, so filed here.)

### Q7. The ADR process existed but never fired (post-hoc finding)
The plugin defines an ADR pathway: sosa.md §13 has Sosa flag "ADR Candidates"
(precedent-setting decisions future missions shouldn't re-litigate) in its
refinement report, and face.md's second pass records them as adr/NNNN-*.md in
the target repo. In this mission it produced nothing: Sosa's report had no
ADR Candidates section at all (absent, not explicitly empty — so it's unclear
the check even ran), Face wrote no adr/ files, and the repo has no adr/
folder. At least one decision plausibly met §13's bar: "the Go CLI is the
single hook installer; the TS installer is deleted" (a lasting convention
from a human answer). Bigger gap: the ADR pathway only exists in the PLAN
phase — the run phase produced the mission's most precedent-setting decisions
(redaction scope boundary ratification, value-shape detection as the durable
strategy, single-enforcement-point-vs-codegen boundary) with no ADR mechanism
at all. Candidates: (a) make the ADR Candidates section mandatory-even-if-
empty so its absence is detectable; (b) give Hannibal or the retro an ADR
pathway for run-phase decisions.

### Q6. Face self-reported decomposition rationale — good pattern
The pass-1 report explicitly listed judgment calls (merged FR-13 into WI-583,
WI-581 as intentional hub) with reasons. That gives Sosa concrete claims to
challenge instead of re-deriving intent. Worth encoding as a required section
of Face's report format if it isn't already.

## 3. Output Tuning

### T1. Two-version Sosa report forced a delta reconciliation
Sosa sent a preliminary report (with questions pending), then a FINAL report
~12 min later with sharper per-item text (exact createItem field values, extra
line refs, stronger ACs). I dispatched Face pass 2 off the preliminary to
overlap the work, then had to send a delta follow-up. The overlap was worth it
(pass 2 started 12 min earlier), but the protocol should be explicit — either:
(a) Sosa marks the preliminary as "safe to dispatch, final will only add
precision," or (b) Sosa sends only one report and the orchestrator dispatches
once. Ad-hoc reconciliation by the orchestrator is where instructions get lost.

### T2. Refinement inflates ACs past the sizing ceiling — decide the rule
Sosa's mandated criteria pushed WI-581 and WI-584 to 7 ACs each (ceiling is 5).
Face flagged it and recommended keeping them whole (each is a single file/
behavior); I agree — splitting would manufacture same-file dependency chains.
But the interaction is systematic: every hardening pass adds ACs, so post-
refinement items will routinely exceed a ceiling calibrated for first-pass
sizing. Options: (a) ceiling applies to first pass only, refinement may exceed
with a flag; (b) count "hygiene" ACs (e.g. "no entry references project.yaml")
separately from functional ACs. Recommend (a) — simplest, and the flag keeps
the signal.

### T3. S4 experiment verdict: same-agent pass 2 worked
Face pass 2 via SendMessage to the live pass-1 agent completed in ~16 min
(including absorbing a mid-pass delta correction) with zero exploration and no
context re-establishment. It also correctly self-flagged the AC-ceiling issue —
context retention from pass 1 (it knew the ceiling it had designed to) is
plausibly why. Recommend the plan command adopt agent-reuse for pass 2.

### T4. Sosa's final-report format is the keeper
Per-item instructions with field names and exact replacement text ("change the
refine at :211-213 to `...`") is precisely what a no-codebase-access second
pass needs. The preliminary report's looser prose ("update the refine to also
accept repo_url") would have made Face re-derive details. The final format
should be the required schema for refinement reports.

## Run Phase Observations (/ai-team:run)

Josh's directive: **observation mode** — do not fix A1/A2 pre-run; grade the
end-of-mission Debrief/retro on whether it independently surfaces them.

### R1 (quality) — precheck caught a real thing, for the wrong reason
Unit precheck failed: `lib/__tests__/hooks.test.ts` asserts the fetcher omits
X-Api-Key when the env var is unset — but the test doesn't stub the var, so any
shell with a real `DEVTRACK_API_KEY` exported fails it (confirmed: green with
`env -u DEVTRACK_API_KEY`). Precheck submitted as passed with the caveat in the
output payload. Two learnings: (a) pre-existing test-isolation gap — tests that
assert on env-var absence must stubEnv, another thing the retro could surface;
(b) the mission's own theme in miniature: a REAL credential got printed into
test output during a mission about secret redaction. Update 19:12: Murdock
independently rediscovered and correctly diagnosed the same env leak while
running WI-577's suite — corroborates (a), and each agent will re-pay this
diagnosis cost until the test stubs its env. Update 19:19: THIRD instance —
Go side this time (cli config_test.go fails when DEVTRACK_API_URL is exported;
Murdock diagnosed it again and pre-warned B.A. in the handoff). The env-leak
class now spans both language suites; strong retro candidate.

### R9 (speed/quality) — ALERT-with-contract: Murdock's handoff pattern
When WI-579 hit "no idle ba", Murdock's ALERT included a complete
implementation contract: exact struct/function signatures, the 3-step
resolution chain, which existing helpers to reuse (normalizeRepoURL), what NOT
to touch (ReadManifest), TDD red state, and the verify command. B.A. can start
cold with zero re-derivation. This should be the required ALERT/handoff format
in the playbook — it converts queue latency into prep time. (Payoff observed
at 19:24: the contract was forwarded verbatim in the WI-579 dispatch.)

### R8 addendum — landmine wider than known; fallback (c) used
The custom-marker fix (b) failed: swagger-jack v0.3.0 orphans markers in
root.go/internal/config.go into dead comments. And a THIRD unprotected
casualty surfaced: internal/client/client.go's Cloudflare Access headers
(ACCESS_CLIENT_ID/SECRET) — production-critical for the CF-gated deploy,
would have silently broken prod auth on any regen. B.A. executed fallback (c)
exactly as specified: reverted 9 collateral files, kept only the two
genuinely-regenerated event command files, logged a warn-level activity entry.
Durable fix (post-mission): swagger-jack marker support in these files, or
move the custom logic out of generated files entirely.

### R10 (quality) — cross-agent test review caught a fixture bug, but via
### protocol deviation
B.A. found Murdock's events-new-types.test.ts uses a non-RFC4122 UUID const,
failing 3/13 tests on zod's .uuid() check — unrelated to the impl. Per the
playbook, a genuine test bug should trigger B.A. self-rejection (--return-to
testing); instead B.A. completed the item and flagged the fix directly to
Murdock/Lynch. Pragmatic (the fix is a one-line constant swap, Lynch reviews
tests+impl together anyway) but it means the item entered review with 3 known-
failing tests. RESOLVED 19:25: Lynch did the clean bounce — REJECTED WI-577
back to Murdock citing the UUID fixture bug. The review gate held; the only
cost of B.A.'s deviation was one extra review cycle (~2 min of Lynch time)
that a self-rejection would have skipped. Also
observed: B.A. commits per-item (0601d82) rather than leaving all commits to
Tawnia; if that's not intended, the playbook should say who commits.

### R2 (speed) — Wave 0 is 4-wide but N=1 (memory-bound)
`scaling compute`: depGraphMaxPerStage=4, memoryBudgetCeiling=1 → N=1. The
planning-side parallelism (3 independent Wave 0 items + deletion task) is
wasted on this host; items will serialize through one lane. The wave math
only pays off on bigger boxes — worth surfacing memory as a first-class
constraint in mission cost/tuning discussions.

### R3 (tooling gap) — playbook says curl, deployment says no
The playbook persists scalingRationale via raw `curl PATCH /api/missions/{id}`,
but this deployment sits behind Cloudflare Access — raw curl gets a 302; only
the ateam CLI carries the auth headers. No CLI verb exists for it, so the
rationale went unpersisted (logged to activity instead). Fix candidates: have
`scaling compute` persist server-side (it's already a server call), or add a
missions-update CLI verb. Any playbook step that shells raw curl is broken on
CF-Access deployments.

### R5 (speed + tuning) — NO_TEST_NEEDED items have no pipeline lane
WI-585 (deletion task, empty outputs.test) has no defined route: the pipeline
entry point is Murdock, who has nothing to do on a no-test item. With N=1 that
would also burn the only Murdock slot on a no-op. Orchestrator judgment call:
moved it ready→implementing directly (board API allowed the skip) and
dispatched B.A. while Murdock works WI-577 — the two idle-capacity items now
run in parallel despite N=1. The playbook should codify this: NO_TEST_NEEDED
items enter at implementing, not testing.

### R6 (quality/reliability) — playbook hardcodes 'hannibal' as message target
Agents' FYI/ALERT messages to 'hannibal' silently bounce — in native teams mode
the main session's addressable name is 'team-lead'. The pipeline survived by
accident: idle-notification *summaries* ("[to hannibal] FYI WI-585 → lynch")
leaked the payloads. Amy noticed ("hannibal unreachable") and fell back to
messaging lynch. Fixed live by broadcasting the correct address to all four
agents. Playbook fix: parametrize the orchestrator address (or alias
'hannibal' → main). This is exactly the class of silent-stall the mandatory
heartbeat exists for — but here the failure mode was *invisible loss*, not
silence, which the heartbeat wouldn't catch.

### R7 (speed data point) — WI-585 wall-clock: ~6 min ready→done
Direct-to-B.A. dispatch 19:04 → deletion+verify 19:07 → Lynch approve 19:08 →
Amy VERIFIED 19:10. Peer-to-peer handoffs added near-zero latency between
stages. Baseline for comparing test-carrying feature items.

### R8 (quality) — regen landmine: hand-written logic in generated files
B.A. (WI-577) discovered that cli/cmd/root.go's env-var resolution
(DEVTRACK_API_KEY/URL) and cli/internal/config.go's GetConfigValue/
SetConfigValue live in swagger-jack-generated files WITHOUT custom-block
protection — any `swaggerjack update` deletes them (confirmed empirically on
both v0.3.0 and v0.4.0, then reverted). The planning docs said "regen via the
pipeline"; nobody knew the pipeline was destructive. Decision (Hannibal):
protect the logic with swagger-jack:custom markers first, then regen honestly
(option b) — approved as in-scope for WI-577. Notable agent behavior: B.A.
tested both tool versions, reverted cleanly, and presented three options with
tradeoffs before touching anything — the verify→recommend→ask pattern (Q4)
appearing unprompted in a pipeline agent.

### R11 (speed) — rejection re-entry forces a no-op B.A. touch
After Murdock fixed the WI-577 fixture, the stage sequence demanded
testing→implementing→review even though Lynch had already verified the impl
and zero implementation work remained — the "implementing" step would be B.A.
running one test command. With B.A. busy on WI-578, that's queue latency for
a no-op. Orchestrator override: moved the item straight to review and queued
it in Lynch's inbox. Playbook candidate: on fixture-only rejections
(--return-to testing where the impl is untouched), the re-entry path should be
testing→review directly.

### R12 (quality — the pipeline's best catch so far) — Lynch found real
### secret-leak bugs in the redaction package
WI-578 passed 6/6 tests (14 sub-tests), build/vet clean — and still leaked
secrets: quoted multi-word values (password="my secret value"), spaced
assignments (KEY = value), and JSON-quoted-key shapes ({"password": "..."})
all escaped the regex in cleartext. Lynch rejected to testing and named the
exact shapes. Notes: (a) green TDD ≠ secure — the test contract itself was
too narrow, so B.A. implemented exactly what the tests pinned and no more;
(b) the orchestrator's dispatch hint ("extra scrutiny on pattern escapes —
compound commands, quoted values, --flag=secret") aligned with where the bugs
actually were — review-focus hints on security-critical items seem to pay;
(c) this is the second Lynch rejection of the mission, both legitimate — the
review stage is earning its latency.

Addendum 19:44 — Amy's probing found a THIRD round of leakage: Go-style ':='
assignment with quoted value (apiKey := "sk-live-...") bypasses both regexes.
Rejection #2 on the item; each pipeline layer (Lynch review, Lynch re-review
with adversarial cases, Amy probing) caught shapes the previous layer missed.
Two readings for the retro: (1) defense-in-depth across distinct agents
demonstrably works — three independent adversarial passes, three distinct bug
harvests; (2) the deeper signal: enumerate-the-shapes regex redaction is
whack-a-mole — six leak shapes so far and counting. A durable fix probably
inverts the approach (match key names anywhere with any assignment/separator
syntax, or entropy-based value detection). Left uncorrected mid-mission per
observation mode; expect the retro to surface it — if it doesn't, that's the
A2-style gap test failing.

Addendum 19:50 — rejection #3 (Lynch, adversarial sweep as nudged):
os.environ['SECRET_KEY'] = "value" leaks because assignRe's key group never
got the tolerance headerRe gained in round 2 — the fix for one regex didn't
propagate to its sibling, a classic patch-local-don't-generalize failure.
SEVEN leak shapes now. rejectionCount 3/4 — one more auto-blocks the item.
Orchestrator intervention: told Murdock to make round 4 exhaustive (enumerate
all foreseeable shape families in one sweep) instead of minimal, and invited
an explicit "this approach can't close" design signal if the enumeration
keeps growing. The per-round minimal-fix loop is itself a finding: TDD's
red-green-minimal instinct is exactly wrong for security pattern-matching,
where each fix must generalize across the whole input family.

Addendum 20:24 — WI-578 hit the cap and AUTO-BLOCKED. Amy's 8th distinct leak
(whitespace inside bracketed keys: config[ "api_key" ] = "v" fully unredacted)
was a legitimate, in-scope, new find — she honored the setx adjudication and
rejected on fresh ground, correctly, even knowing it would block. Josh
authorized one more cycle; unblocked via blocked→ready→testing (learning:
blocked→testing is an INVALID transition and --force does not bypass the
transition matrix — ready is the only unblock re-entry). Cap-semantics finding
for the retro: rejectionCount conflates thrash with genuinely-hard items.
Eight real bugs in one 60-line regex file is not churn — it's a signal the cap
should distinguish "same bug bouncing" from "new bug each round," or weight
security items differently. Also told Murdock to pin the now-proven bug class
(whitespace-tolerance asymmetry) preemptively across both regexes.

Resolution 20:26 — Murdock delivered the requested design signal ("the
space-separated command family is UNBOUNDED; the shape-regex can't close it")
with a costed recommendation. Ratified as orchestrator: FR-11 scope = operator-
delimited assignments + headers; command forms (setx/set/env/...) declared out
of item scope; value-shape detection (entropy + known prefixes sk-live-/ghp_/
AKIA/eyJ) recorded as the durable-fix backlog item. Round 5 bundles Amy's
bracket-whitespace leak + the ::= leak + :: over-redaction guards so one cycle
closes everything in ratified scope. Meta-observation: the orchestrator asking
"tell me if the approach can't close" (round-4 guidance) is what surfaced the
design signal — worth making a standing instruction for security items.

### R19 (process) — Tawnia's final-commit sweep swallowed pre-existing dirty
### state
The final commit (04e5ff0) staged-and-committed .gitignore and
prd/005-unified-document-model.md — both dirty in the working tree BEFORE the
mission started (session-start git status). "Bundle any uncommitted mission
work" has no way to distinguish mission fallout from the operator's unrelated
local edits. Fix: Tawnia should diff against the mission-start snapshot (or
ask) before sweeping; or Hannibal should record `git status` at mission start
and pass the pre-existing-dirty list into Tawnia's prompt as do-not-touch.

### R18 (safety incident) — Amy wrote to real ~/.claude/settings.json
While probing WI-584's install path, Amy ran `devtrack hooks install
--claude-code` without redirecting the settings path, mutating Josh's REAL
~/.claude/settings.json (git-tracked dotfiles). She caught it instantly,
verified the blast radius (one file), reverted via git checkout (diff zero),
and disclosed unprompted with full detail. Two learnings: (1) probe agents
need a sandbox convention for commands whose side effects target user-global
state (HOME override / env redirect as standard probe hygiene — the tool
itself could support a --settings-path flag for testability); (2) the
disclosure behavior is exactly what you want — worth reinforcing as the norm
in amy.md. Also incidentally confirmed the known duplicate-append limitation
on existing claudeCodeHooks installs (already-scoped rollout item, not new).

### Pipeline stats (all 9 items through, 19:03–21:22, ~2h20m wall-clock)
- 9/9 done; 8 rejections total, EVERY one a distinct real bug (5 on WI-578
  alone, 1 each on WI-577/580/581); 1 rejection-cap auto-block + human
  unblock; 0 spurious rejections; 0 stalls; heartbeat never had to intervene.
- Bugs the layered pipeline caught that tests alone missed: 8 secret-leak
  shapes, 1 unhandled P2002 crash (falsified a planning assumption), 1
  unwired flag (AC violation seeded by the handoff contract), 1 UUID fixture
  bug, 1 hook-marker idempotency bug (B.A. self-caught).
- Live-fire probing (Amy building the real binary, real git repos, capture
  servers, chmod 555 dirs) repeatedly found what code-reading couldn't.

### R17 (quality — pipeline learning transfer) — Murdock encoded the R15
### lesson unprompted
One item after Lynch's WI-581 rejection ("--project-yaml declared but never
wired"), Murdock's WI-582 test set included TestSendEvent_BootstrapsManifest-
WhenAbsent — a trigger-WIRING test added, in Murdock's own words, "to avoid
the WI-581-style helper-exists-but-isn't-wired gap." Agents in one mission do
transfer lessons across items when the rejection reason is articulated
clearly. Retro should consider: rejection reasons as first-class data that
future test-writing consults (this happened by ambient context here; a
persistent mission-lessons feed would make it reliable).

### R16 (quality/architecture) — FR-11's enforcement point has a generated
### back door
Amy's WI-581 probe: cli/cmd/events_createEvent.go (the swagger-jack-generated
raw command) POSTs directly to /events, bypassing sendEvent — so redaction and
the identity chain are skipped entirely for anyone using the generated command
instead of the convenience `event` command. Predates the mission, out of item
scope, inherent to client-side-only redaction. Combined with R8 (the same
generated files clobber hand-written logic on regen), the pattern is clear:
the generated CLI surface and the hand-built enforcement layer are fighting.
Durable options for the backlog: server-side redaction as a second layer, or
excluding /events from the generated command surface. This is A2-adjacent
material the retro should connect: THREE separate findings (R8, R16, setx)
all trace to "the enforcement/codegen boundary was never designed."

### R15 (quality) — the contract pattern's failure mode: contract error
### propagates to implementation
WI-581 rejection #1: --project-yaml was declared but never wired into
sendEvent, violating AC7 ("honored when given"). Root cause chain: Murdock's
otherwise-excellent contract explicitly said "present-project-yaml behavior
isn't pinned by tests; simplest is to let the chain win" → B.A. implemented
the contract faithfully (and candidly logged the simplification) → the AC was
silently dropped. Lynch caught it by reviewing against the ITEM's ACs, not
the handoff contract. Learning for the playbook: contracts accelerate
implementation but must never override ACs — reviewers should diff
contract-vs-ACs explicitly, and a contract that says "AC X unpinned by tests,
skipping" is a red flag to fix the tests, not skip the AC.

### R14 (process) — parallel test-authoring races the review stage
The R9 pattern (Murdock authoring tests in parallel with B.A.'s fix) finally
bit: Lynch's round-5 review ran the full suite against a working tree where
the deliberately-red ::=/:: tests existed but B.A.'s fix hadn't landed —
rejection #5, auto-block, on bugs that were already in-flight-being-fixed
under the human-authorized cycle. Three coordination-latency incidents on this
one item (dropped sweep, skipped scope items, review race), all from
orchestrator instructions crossing agent handoffs mid-flight. Fixes to
consider: (a) a "hold review — fix in flight" item flag the review stage
respects; (b) quarantine parallel-authored red tests in a separate file/build
tag until the fix lands; (c) rejection-count increments only on NEW findings,
not on known-red work-in-progress. Unblocked again (same rationale: same bug
set, same authorized cycle — coordination noise, not a new decision).

### R13 (tooling) — blocked items strand agent claims
When WI-578 auto-blocked mid-cycle, Murdock's agentStart hit INVALID_STAGE but
its pool slot was already claimed .busy with no agentStop possible on a blocked
item — a stuck slot requiring manual `ateam pool release`. (Self-resolved here
because the next work item's claim cycle recycled the slot, but that was luck.)
agentStop should be callable on blocked items, or auto-block should release
claims.

### R4 — CLI flag papercut
`missionPrecheck --passed true` fails ("unknown command: true") — it's a bare
boolean flag (`--passed`), unlike most other flags that take values. Cost one
retry; swagger-jack flag-generation inconsistency.

## Retro Grading (the pre-registered experiment)

Josh's question: does the end-of-mission Debrief independently find what live
observation found? Verdict: **strong on code-level learnings, blind on design
synthesis and process findings — and the blindness has a traceable cause.**

**What the retro caught (hits):**
- WI-578 whack-a-mole dynamics, per-round leak inventory, and a high-priority
  "front-load adversarial input matrices for security parsers" rule → matches
  the R12 family, lands as a durable test-writing skill change.
- "unpinned-acceptance-criterion" learning from WI-581 → matches R15's core
  (no test pinned the --project-yaml AC), though it credits the gap to
  test-writing and misses the contract's role in seeding it.
- WI-580's inconsistent-error-handling learning → matches Amy's P2002 catch.
- **Novel find we didn't have:** the telemetry regression — activity feed,
  token usage, tool histogram, and skill usage ALL empty for the mission; the
  retro ran in degraded work-log-only mode. (Possible lead: the projectId
  case mismatch noted in Raw Notes — DevTrack vs devtrack.)

**What the retro missed (misses):**
- **A2 (the pre-registered gap test): FAILED.** Dual PostToolUse registration
  (plugin hooks.json + installer-written claudeCodeHooks both firing → two
  tool_use events per Bash call, violating FR-2 "exactly one") appears nowhere.
- The design-level signal: Murdock's "shape-regex can't close; the command
  family is unbounded" analysis and the ratified value-shape-detection backlog
  item didn't surface — the retro's fix stays inside the testing paradigm.
- The R16 synthesis (regen clobber + generated-command bypass + setx = one
  undesigned enforcement/codegen boundary) — not connected.
- ALL process/orchestration findings: hannibal routing bug (R6), review race
  (R14), cap semantics, blocked-strands-claims (R13), settings.json incident
  (R18). **Likely root cause: these lived in the activity feed — the exact
  channel the telemetry regression emptied.** The lesson-carrying channel to
  the retro was the broken one; the misses and the novel find are the same bug.

**Conclusion for the process:** the retro is a good code-lessons engine but is
not a substitute for live orchestrator observation — and its vantage is only
as good as the telemetry pipeline feeding it. Fix the hook capture gap first;
then re-test whether process findings start surfacing. A1/A2 still need
manual follow-up (A2 especially — it's a live correctness question the moment
both hook registrations exist on one machine).

## PRD Coverage Audit (orchestrator, post-plan)

Independent field-by-field check of the 9 finalized items against the PRD's
13 FRs, 3 NFRs, and 8 edge cases — done from the board data, not the agents'
reports. Board state verified directly: ready = {577, 578, 579, 585},
briefings = {580–584}, matching Face's claim.

**Verdict: the slicing is correct.** Every FR maps to exactly one owning item;
all 8 edge cases have a matching AC (including stdin-malformed quiet exit,
`vim docs/api-keys.md` unredacted pass-through, and local-only repos).

Coverage matrix: FR1→577 · FR2/3→584 · FR4-7→583 · FR8→579+581 · FR9→580 ·
FR10→582 · FR11→578+581+584 · FR12→583 (git side only — see A1) · FR13→583 ·
NFR2→578 · NFR3→577.

Concerns chased and cleared:
- `session-start`/`session-end` (hyphen) looked like another invalid-type bug,
  but `mapEventType` (cli/cmd/event.go:33) converts hyphens to the underscore
  forms the API accepts. Valid.
- Shared-file serializations (577→580 on schemas/openapi, 583→584 on hooks.go)
  confirmed real at the named line numbers.
- WI-582 writes to manifest.go (owned by WI-579) but is serialized via the
  581→579 dependency chain. No conflict.
- Bootstrap "retry on next send" edge case falls out naturally from the
  trigger condition (no manifest → write). Covered.

### A1 (gap) — FR12's Claude half has no AC
"A hook failure shall never break a git operation **or a Claude session**."
WI-583 has the git-side AC (exits zero, git operation unaffected). WI-584 has
nothing equivalent for the Claude side — context says keep `|| true`, and the
malformed-stdin AC covers one failure mode, but no AC asserts "CLI error or
network down → exits quietly, session unaffected." Fix: one AC on WI-584.

### A2 (gap) — FR2 "exactly one" has a dual-registration hole
WI-584 updates BOTH PostToolUse definitions: the plugin bundle's
`hooks/hooks.json` and the installer-written `claudeCodeHooks` in
`~/.claude/settings.json`. A machine with the plugin installed AND the
installer run fires both on every Bash call → two tool_use events per command.
The PRD only anticipates *stale* global hooks as a rollout risk, not two fresh
registrations. Needs a deliberate call (Josh): either the installer skips the
PostToolUse entry when the plugin bundle provides it (AC on WI-584), or the
duplicate is explicitly accepted under overcollection (PRD note).

### A3 (nit, accepted) — truncation cap value unpinned
WI-578 says "a defined maximum length"; the PRD says "sane maximum," so
implementer's choice is compliant — but pinning a number in the AC would
remove a Murdock/B.A. negotiation.

### A4 (nit, accepted) — find-or-create race can duplicate projects
`repoUrl` is not unique, so WI-580's findFirst-then-create can dupe under true
concurrency. Context flags it; overcollection tolerates it. Leave as is.
**CORRECTED by Amy's probe (19:52, WI-580 rejection #1):** the assumption was
wrong — `name` IS unique in Prisma, so the losing request in a same-new-repo
race throws an unhandled P2002 and crashes, it doesn't silently duplicate.
Also caught: project.create() lacked the try/catch + handlePrismaError
wrapping every sibling Prisma write uses. The probing stage falsified a
planning-time assumption that survived Face, Sosa, my audit, Murdock's tests,
B.A.'s impl, and Lynch's review. Strongest single argument in this run for
the mandatory-probing rule.

## Raw Notes

- Pre-flight `ATEAM_PROJECT_ID=DevTrack` but `createMission` response says
  `projectId: "devtrack"` — case-normalized server-side. Harmless, worth knowing.
- Board WIP limits: ready=10, testing/implementing/probing/review=6.
- `items listItems --json` piped to python returned nothing at +60s — verified
  raw at +3min: `{"success":true,"data":[]}`. Genuinely no items; not a stage
  filter footgun. Also confirms `--force` archive cleanly emptied the board.
