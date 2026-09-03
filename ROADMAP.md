# ROADMAP — OpenDesign-style UI/UX port

Apply OpenDesign's design language (neutral-first palette, pill geometry,
floating panels, tokenized motion) to Open Science Desktop, while keeping
Open Science's own identity (warm paper ground, terracotta, serif prose) and
its compatibility guarantees. Design source: the `open-design` repo symlinked
at the repo root — `apps/web/src/styles/tokens.css` is the reference token
file; `docs/screenshots/product-tour/` are the reference screenshots.

Decisions below were reviewed in-session on 2026-08-30; remaining calls were
delegated ("self decide"). Each phase lands separately and is separately
revertable.

## Status — all four phases shipped 2026-08-30

Verified on the working tree: `typecheck` clean, `lint` clean, **1186 tests
passing** (1165 at baseline, +21 new), production build clean. Compiled CSS
confirmed to carry the coarse-pointer rule, `.panel-glass` with its
`backdrop-filter`, the pill radius, and the Albert Sans face.

Bugs found and fixed during the work, none of them anticipated by the plan:

- `--error` and `--brand` were near-identical terracotta, so a destructive
  button read as the primary one. `--error` moved to crimson in all themes.
- Warm and light grounds collapsed to the same near-white once light stopped
  being `#ffffff`. Light's ground is now cool grey, distinct from warm's paper.
- Filled brand/danger controls used `text-white`, which fails contrast on
  dark's light-toned fills. Added `--brand-fg` / `--error-fg`.
- The accent flip turned a sidebar dialog's Save button white-on-white in dark
  (`bg-accent text-white`); fixed by the `Button` primitive's `text-accent-fg`.
- `Chip` emitted `aria-pressed` from its visual `selected` prop, announcing a
  toggle on popover triggers that are described by `aria-expanded`. ARIA is now
  opt-in through a separate `pressed` prop.
- `hover:bg-hover` in ModelPicker referenced a utility that never existed, and
  a sidebar badge referenced `--color-surface`, also nonexistent.
- Controls were 28/36px, under every touch guideline, on a UI that is served to
  phones through the gateway. A `@media (pointer: coarse)` rule now grows every
  primitive to 40px without touching desktop density.

Known follow-ups, deliberately not done:

- The rail is not yet inset from the window edge; the float is carried by the
  `--panel`/`--bg` contrast and the wrapper lift. A true inset needs
  `AppShell.tsx` and changes the drag-divider geometry, where `clientX` *is*
  the width.
- `app/routes/RunsPage.tsx` has a file-private `Chip` that predates the
  primitive and duplicates `Chip readOnly`. Out of the Phase-3 scope; the name
  now collides conceptually with the primitive.
- `settings/`, `inspector/` and `notebook/` still carry 24 `hover:bg-surface-2`
  sites. Correct per the plan — they inherit through tokens — but they are the
  remaining visual drift from the shell.
- Phone-width verification covered the primitives in isolation, not the
  migrated surfaces mounted in the real app; that needs a running app with
  stores and a router.

## Locked decisions

| Question | Decision |
| --- | --- |
| Scope | Tokens + primitives + shell migration. Feature-screen layouts, routing, panes, and Screens are untouched. |
| Palette | OpenDesign *structure* (neutrals carry the UI, ink controls, sparse brand pop), Open Science *hues* (warm stays default; terracotta is the pop where OpenDesign uses lime). No brand borrowing from OpenDesign — no lime, no logo, no wordmark. |
| Primitives | New shared layer in `components/ui/`; migrate only shell surfaces (~25–35 files). The ~140 viewer/inspector files inherit the look through tokens and keep their inline classes. |
| Typography | Albert Sans (OFL, `@fontsource/albert-sans` 400/500/600) for UI sans. Source Serif 4 (prose) and JetBrains Mono (code) unchanged. |
| `--accent` | Flips from terracotta to ink — controls are made of ink; terracotta moves to a new `--brand` used sparsely (selected state, one CTA per screen). This is the one meaning change to an existing token; everything else is additive. Revert = two-file `git checkout`. |
| Untouchable | `--series-1..8`, `--chart-grid/axis`, `--hl-*` — chart + highlight tokens are a cross-package contract (`@ai4s/shared`, matplotlib style). The port is chrome only, never data color. |
| Compatibility | No existing token or Tailwind utility is renamed or removed. All current call sites (`border-border` ×187, `rounded-input` ×167, `rounded-card` ×62, `bg-accent` ×51) keep compiling; values are retuned, rungs are added. |

## Phase 1 — Token layer

**Files:** `apps/desktop/src/index.css`, `apps/desktop/tailwind.config.js`,
`apps/desktop/package.json` (fonts).

Per theme (`warm` default, `light`, `dark` — identical structure, own neutrals):

- **Surface ladder** — add `--panel` (floating rail/toolbars/popovers, one step
  *lighter* than `--bg` so panels float). Warm: `#fffdf7` on `#f7f5ef`.
- **Border ladder** — add `--border-strong`, `--border-selected` above the
  existing `--border`/`--border-faint`.
- **Text ladder** — add `--text-strong`, `--text-muted`, `--text-faint` around
  the existing `--text`/`--muted` (5 rungs, like OpenDesign).
- **Accent flip** — `--accent` becomes ink (warm: `#2f2c28`), `--accent-fg`
  near-white; new `--brand` `#c15f3c` + `--brand-soft` + `--brand-text`.
  Light theme's ink is neutral (`#202024`-ish); dark inverts (light controls
  on dark ground). Light/dark's former blue accent retires to `--link` only.
- **Fill ladder** — `--fill-3/-2/-1` translucent inks for hover/press states,
  replacing ad-hoc `hover:bg-surface-2` in migrated surfaces.
- **Glass** — `--glass` (66% `--panel` + `--glass-blur: 28px`). Composes with
  the existing macOS `[data-vibrancy]` rules in `index.css` (vibrancy wins on
  the sidebar surface); elsewhere it must degrade to solid `--panel` where
  `backdrop-filter` is unavailable.
- **Motion** — `--dur-quick 100ms / --dur 150ms / --dur-enter 200ms /
  --dur-slow 300ms`, `--ease-out cubic-bezier(0,0,0,1)`,
  `--ease cubic-bezier(0.33,0,0.67,1)`. Applied via Tailwind
  `transitionDuration`/`transitionTimingFunction` extensions.
- **Radius scale** (tailwind) — `rounded-card` 14→**12px**, `rounded-input`
  10→**8px**; add `rounded-pill` (999px), `rounded-xs` (2px), `rounded-sm-tok`
  (4px). Off-scale literals are drift; collapse to the nearest token when
  touched.
- **Shadows** — retune `shadow-card` (softer/tighter), `shadow-pop`; add
  `shadow-lg` for the floating rail (OpenDesign's
  `0 24px 60px … , 0 8px 16px …` weights, warm-tinted alpha).
- **Fonts** — add `@fontsource/albert-sans`; `font-sans` → Albert Sans.

**Acceptance:** app builds; all three themes render; chart/highlight tokens
byte-identical; existing tests pass untouched. The whole app already looks
recolored/resharpened after this phase alone.

## Phase 2 — Primitive components

**Files:** new in `apps/desktop/src/components/ui/`, each with a colocated
`.test.tsx`. Thin Tailwind-class components (same pattern as the codebase —
`cn()` helper, no CSS-in-JS, no new deps).

| Primitive | Shape | Variants |
| --- | --- | --- |
| `Button` | pill (`rounded-pill`) | `primary` (ink fill), `secondary` (border, transparent), `ghost`, `danger`; sizes `sm/md`; `icon` slot |
| `IconButton` | circle | `ghost` default; `active` state uses `--fill-2` |
| `Chip` | pill | `default`, `selected` (`--brand-soft` bg + `--brand-text`), `removable` |
| `Segmented` | pill group | single-select pills for mode switches (e.g. artifact-type rows, Preview/Code style toggles) |
| `Card` | `rounded-card` | `flat` (border only), `raised` (`shadow-card`) |
| `Panel` | `rounded-card`+`shadow-lg` | `solid` (`--panel`), `glass` (`--glass` + blur, solid fallback via `@supports`); the floating-surface primitive |
| `Input` | `rounded-input` | text input + the existing `select-chrome` treatment folded in as `Select` |

Rules: primitives read tokens only (no literals); every interactive state uses
the motion tokens; focus rings use `--border-selected`.

**Acceptance:** unit tests per primitive (variants, a11y roles,
`@supports`-fallback for glass); nothing else in the app changed yet.

## Phase 3 — Shell migration

Migrate the surfaces that define the app's feel to the primitives; audit the
51 `bg-accent` call sites and promote the genuinely-"selected/CTA" handful to
`bg-brand` (target: ≤1 brand CTA visible per screen — OpenDesign's sparseness
rule).

| Surface | Files (indicative) | Treatment |
| --- | --- | --- |
| Sidebar | `components/sidebar/Sidebar.tsx`, `StatusPills.tsx` | Floating `Panel` (inset from window edges, `rounded-card`, `shadow-lg`); macOS vibrancy path preserved; status pills → `Chip` |
| Session chrome | `components/session/GroupTabs.tsx`, `SessionView.tsx`, `SplitMenu.tsx` | Tabs → pill segmented style; drag regions unchanged |
| Composer | `components/thread/Composer.tsx`, `ComposerAttach`, `ModelPicker`, `AcpConfigPicker`, `WorkspaceChip`, `GoalPill` | The OpenDesign move: elevated `Card` with pill controls inside; pickers → `Chip`/`Segmented` |
| Thread atoms | `components/thread/atoms.tsx`, `ToolCallRow`, `ToolGroup`, `MessageMeta`, `WorkflowStarters` | Buttons/chips → primitives; row hover → `--fill-3` |
| Dialogs & overlays | `components/ui/ConfirmDialog.tsx`, `ContextMenu.tsx`, `Toaster.tsx`, `SshSignInDialog.tsx` | `Panel` (glass for context menu/toaster, solid for dialogs); buttons → `Button` |
| Cards | `components/cards/EmptyState.tsx`, `thread/ArtifactCard.tsx`, `ReviewerCard.tsx` | `Card` |

Out of scope (inherit via tokens): `inspector/`, `notebook/`, `files/`,
`artifact-viewer/`, `code-viewer/`, `markdown-viewer/`, `settings/`, `web/`.

**Acceptance:** existing component tests updated where class assertions
changed, none deleted; per-surface before/after screenshots in all three
themes.

## Phase 4 — Verification & polish

- `pnpm test` (vitest) green across `apps/desktop`.
- Visual pass: warm/light/dark × sidebar/composer/dialogs/tabs.
- macOS: vibrancy sidebar still translucent (`data-vibrancy` path).
- Linux WebKitGTK: glass falls back to solid `--panel` cleanly.
- Gateway web client at phone width (390px): floating rail and pill controls
  don't overflow; tap targets ≥ 40px.
- UI zoom (`--zoom`) at 0.8/1.0/1.25: pills and shadows scale sanely.
- Sweep for off-scale radius/shadow/duration literals in migrated files.
- `PROGRESS.md` milestone lines per phase.

## Risks

- **Accent flip surprises** — some of the 51 `bg-accent` sites may look wrong
  in ink before the Phase-3 audit reaches them. Mitigation: Phase 1 and 3 land
  close together; the audit list is generated up front (`grep -rn bg-accent`).
- **Glass on WebKitGTK** — `backdrop-filter` support varies; every glass use
  goes through `Panel`, which carries the `@supports` fallback, so the failure
  mode is "solid panel", never "unreadable".
- **Metric shift from Albert Sans** — dense tables/file trees may reflow a
  pixel or two; checked in Phase 4, and the font swap is a one-line revert
  independent of everything else.
- **Licensing** — design *values* (colors, radii, curves) are ported;
  OpenDesign CSS files are not copied, and no OpenDesign brand assets are
  used. No attribution obligation is triggered.
