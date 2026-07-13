# Improvement Plan — OTel Collector Release Notes Comparator

A prioritized plan covering data gathering, note display, UX, design, and code health.
Items marked **[bug]** are defects observed in the current code, not just polish.

> **Status (2026-07-13):** implemented except for the items below, which are
> deliberately deferred:
> - **1.2** (split data per version) — payload is ~1.4 MB raw / ~300 KB gzipped
>   for full history; revisit when it hurts.
> - **1.3** (parse chloggen YAML / CHANGELOG.md) — 1.4's section-aware parsing
>   of release bodies captures the same structure; revisit if bodies and
>   changelogs diverge.
> - **1.6** (canonical component list from upstream metadata) — the component
>   list is now derived deterministically from validated changelog labels;
>   upstream metadata would add unchanged-component coverage.
> - **2.4**'s group-by-component view toggle (collapsible blocks shipped).
> - **3.4**'s config-based current-version detection ("compare with latest" is
>   effectively the default: To version starts at latest).

---

## 1. Release note gathering (backend)

### 1.1 Fetch full release history **[bug]**
`FetchReleaseNotes` calls `client.Repositories.ListReleases(ctx, owner, repo, nil)`.
With `nil` options GitHub returns only the first page (30 releases), so the site
silently caps out at the ~30 most recent versions per project. Anyone upgrading
from an older version gets no data at all.
- Paginate with `ListOptions{PerPage: 100}` and loop until `resp.NextPage == 0`.
- Decide on a retention window (e.g. all versions, or last N years) since payload
  size grows; see 1.2 for the mitigation.

### 1.2 Split data per version or per project
`release_notes.json` is a single blob that the browser must download fully before
anything renders, and it grows with every release. Split into
`data/<project>/index.json` (version list + metadata) plus one file per version,
fetched lazily for the selected range. Keeps first paint fast forever.

### 1.3 Parse structured changelogs instead of release bodies
Upstream now maintains machine-readable changelogs (`.chloggen` YAML entries and a
generated `CHANGELOG.md` with stable section structure) — this is the real payoff
of issue #7. Release bodies are a lossy rendering of that data.
- Prefer parsing `CHANGELOG.md` at each tag (or the chloggen YAML) to get
  `component`, `change type` (breaking / deprecation / enhancement / bug_fix),
  note text, and issue numbers as structured fields.
- Keep the current body parser as fallback for old versions that predate the format.

### 1.4 Preserve change-type sections **[bug-ish]**
The parser walks bullets line by line and throws away the `### 🛑 Breaking changes`
/ `### 🧰 Bug fixes` headings they sit under. Breaking-ness is then re-guessed by
keyword search (`highlightEmojis`), which mislabels notes that merely contain the
word "fix" and misses breaking changes that don't say "breaking". Track the current
section while parsing and emit a structured `type` field per note instead of
prepending emoji to the text.

### 1.5 Keep sub-bullet structure
Sub-bullets are flattened into sibling notes, so a parent note and its detail lines
render as unrelated bullets. Emit notes as `{text, children[]}` and render nested.

### 1.6 Canonical component list from upstream
Derive the component list from upstream metadata (`metadata.yaml` files or the
githubgen-generated component list referenced in issue #7) rather than only from
whatever appeared in release notes. This gives correct types for everything and
lets the config-paste detector match components that haven't changed recently.

### 1.7 Remove debug artifacts
- Delete `release_debug.log` from the repo root and gitignore it.
- Drop (or gate behind a `-v` flag) the per-release 300-char body dump in
  `FetchReleaseNotes` — it's most of the CI log noise.

### 1.8 Tests for the parser
`ParseUpgradeNotes` / `NormalizeComponent` have real, repeatedly-bitten edge cases
(nested `- \`x\`:` sub-bullets, typo'd names, `type/name` vs bare names, `cmd/`
prefixes) and zero tests. Add table-driven tests with verbatim excerpts from real
release bodies (v0.108.0 and v0.128.0 are good fixtures — both broke us before).

### 1.9 Dependency hygiene
GitHub reports 17 Dependabot vulnerabilities (7 critical) on the default branch,
and `go-github` v50 is several major versions old. Bump modules, enable Dependabot
PRs, and add a `go build ./... && go test ./...` CI job so PRs can't break the
generator (currently nothing compiles the code before the deploy job runs it).

---

## 2. Release note display

### 2.1 Render note markdown **[bug-ish]**
Notes contain markdown — `[bug](https://…)` links, `` `code` `` spans — that is
currently shown raw (only bare `#12345` PR refs get linkified). Render a safe
subset (links, code, bold) client-side. While here: notes are injected via
`innerHTML` with no escaping, so switch to an escape-then-format pipeline to
remove the XSS surface from upstream-controlled text.

### 2.2 Badges instead of emoji prefixes
With structured change types (1.4), replace the `🚨⚠️`/`🐞` string prefixes with
styled badges (`BREAKING`, `BUG FIX`, `DEPRECATION`) and add a "breaking changes
only" filter toggle — the single most useful upgrade-triage view.

### 2.3 Upgrade summary header
Above the results, show totals for the selected range: "v0.110.0 → v0.128.0:
18 versions, 7 breaking changes, 12 bug fixes across your 5 components." Answers
"how scary is this upgrade" at a glance.

### 2.4 Collapsible version blocks + component-centric view
Long ranges produce a wall of text. Make each version block collapsible
(breaking-change versions expanded by default), and offer a "group by component"
toggle so users can read one component's history across versions.

### 2.5 Version-accurate component links
The 🔗 next to a component links to `tree/main/<component>`, which drifts from the
version being read (and 404s for removed components). Link to
`tree/<tag>/<component>` for the version block it appears in.

---

## 3. UX

### 3.1 Support connectors **[bug]**
`app.js` doesn't know connectors exist: the config-paste detector's
`sectionToType` map and section regexes cover only
receivers/exporters/processors/extensions, so `connectors:` blocks in pasted
configs are silently ignored even though the backend emits `connector/*` keys.

### 3.2 Replace the multi-select listbox
The `<select multiple size=12>` requires ctrl/cmd-click (undiscoverable, hostile
on mobile). Replace with a checkbox list or token/chip input with the existing
fuzzy search on top, plus visible "N selected" count and a clear-all. This also
resolves the "Select All Components" button oddity — empty selection already
means "all", so the button mostly creates confusion and giant URLs.

### 3.3 Selection survives searching **[bug-ish]**
The fuzzy-search handler rebuilds the option list with only matching items, so
components selected outside the current filter are silently dropped from view
(and from the next URL update). Keep selected items pinned/visible regardless of
the filter.

### 3.4 Version pickers with context
- Show release dates next to versions ("v0.128.0 — 2025-06-12").
- "Compare with latest" one-click preset; auto-detect user's current version from
  the pasted config if it contains an image tag/comment.
- Validate from < to instead of silently swapping.

### 3.5 States: loading, error, empty
The page is blank while JSON loads, silently broken if fetch fails, and "No
upgrade notes found" doesn't distinguish "nothing changed for your components 🎉"
from "your selection matched nothing". Add a loading indicator, an error banner,
and differentiated empty states.

### 3.6 Compare on load for shared URLs
A shared URL restores the form state but the recipient still has to click
Compare. If the URL contains a full selection, run the comparison automatically.

### 3.7 Copy-link button
URL state exists but nothing tells users about it. Add a "Copy link to this
comparison" button after results render.

### 3.8 Accessibility pass
Announce results with a live region, ensure focus states on all controls, check
contrast in both themes (the `#888` timestamp and `#666` hint text fail on white),
and add proper `aria-label`s to the icon-only 🔗 and 🌙 buttons.

---

## 4. Design

### 4.1 Move inline styles to the stylesheet
`index.html` and JS-created elements (`allComponentsBtn`, timestamp div, release
link) carry long `style="…"` strings. Move them to classes in `style.css` so
theming works in one place.

### 4.2 Rebuild dark mode without `!important`
The dark theme is ~30 `body.dark … !important` overrides, and it forces inputs to
white-on-white-page styling (`background: #fff` inputs inside a dark card). Define
semantic custom properties (`--bg`, `--surface`, `--text`, `--accent`) that flip
under a `data-theme` attribute; components then need no per-theme rules at all.

### 4.3 Typography and hierarchy
Arial + one-size text reads dated. Use a system font stack, tighten the intro
copy (three sentences max, link the caveats), and give version headers / component
names / notes a clearer size-and-weight scale. Consider an OTel-adjacent accent
treatment while keeping the existing purple.

### 4.4 Vendor Fuse.js
Fuse.js loads from jsDelivr — a third-party runtime dependency for a static site
(breaks offline, blocked by strict CSPs, supply-chain exposure). Vendor the minified
file into `docs/` — or drop the dependency entirely; simple substring matching is
arguably better than fuzzy here anyway.

### 4.5 Automate cache busting
`app.js?v=20250627` is a hand-edited constant that's already stale. Have
`generate.go` stamp the query param (e.g. with the generation timestamp) into
`index.html`.

### 4.6 Mobile layout check
The controls row wraps unpredictably below ~700px and the listbox forces a
320px min-width. Define an explicit single-column layout for small screens.

---

## 5. CI / operations

- **Verify before deploy**: run `go vet` + tests (1.8) before the generate step.
- **Heartbeat commits**: the anti-auto-disable heartbeat works but adds a commit
  per day. Alternatives if history noise becomes annoying: push to a `heartbeat`
  ref instead of `main`, or use a keepalive action that re-enables the workflow
  via API without committing.
- **Failure visibility**: the generator `continue`s past per-project fetch errors,
  so a bad token or rate limit yields a silently emptier site. Fail the job (or at
  least alert) when a project returns zero releases.
- **Rate limits**: fetching full history (1.1) multiplies API calls; the workflow
  should pass `GITHUB_TOKEN` explicitly (5k req/h) and cache unchanged versions
  between runs (releases are immutable once published — cache by tag).

---

## Suggested sequencing

| Phase | Items | Rationale |
|-------|-------|-----------|
| 1 — correctness | 1.1, 3.1, 3.3, 2.1 (escaping), 1.7 | Real bugs, small diffs |
| 2 — data quality | 1.3, 1.4, 1.5, 1.8 | Unlocks everything display-side |
| 3 — display | 2.2, 2.3, 2.4, 2.5, 3.5, 3.6 | The visible payoff of phase 2 |
| 4 — UX/design | 3.2, 3.4, 3.7, 3.8, 4.1–4.6 | Polish once behavior is right |
| 5 — ops | 1.9, section 5 | Ongoing hygiene |
