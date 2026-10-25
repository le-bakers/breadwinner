---
name: BreadWinner
description: Existing green identity with a shared Home and History receipt workspace.
colors:
  primary: "#22C55E"
  primary-hover: "#16A34A"
  accent-light: "#DCFCE7"
  accent-deep: "#14532D"
  background: "#F8FAF8"
  card: "#FFFFFF"
  border: "#E5E7EB"
  text: "#1F2937"
  text-secondary: "#6B7280"
  success: "#10B981"
  workspace-muted: "#59665F"
  workspace-green: "#166534"
  review-background: "#FEF9C3"
  review-text: "#A16207"
  approval-background: "#FDE68A"
  approval-text: "#78350F"
  destructive: "#DC2626"
  dark-background: "#10160F"
  dark-card: "#1A231C"
  dark-border: "#2A342B"
  dark-text: "#EDF3EC"
  dark-text-secondary: "#9BAA9C"
  dark-primary-hover: "#4ADE80"
  dark-success: "#34D399"
  dark-workspace-muted: "#B1BDB3"
  dark-workspace-green: "#86EFAC"
  dark-row-hover: "#202B22"
  dark-row-open: "#223026"
  dark-editor: "#161E17"
typography:
  display:
    fontFamily: "Manrope, Inter, -apple-system, sans-serif"
    fontSize: "min(64px, calc(100cqi / var(--metric-width, 6)))"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Manrope, Inter, -apple-system, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Manrope, Inter, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter, Manrope, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, Manrope, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 500
rounded:
  field: "8px"
  workspace-control: "10px"
  history-group: "12px"
  sm: "15px"
  md: "16px"
  lg: "20px"
  full: "999px"
spacing:
  compact: "8px"
  control-gap: "10px"
  row-gap: "12px"
  section-gap: "16px"
  page-gutter: "24px"
  editor-gap: "28px"
  summary-gap: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.card}"
    rounded: "{rounded.full}"
    padding: "13px 26px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "rgba(255, 255, 255, 0.678)"
    textColor: "rgb(43, 43, 43)"
    rounded: "{rounded.full}"
    padding: "13px 26px"
  input-home:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    height: "44px"
  review-button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.workspace-control}"
    height: "40px"
    padding: "0 12px"
  status-review:
    backgroundColor: "{colors.review-background}"
    textColor: "{colors.review-text}"
    rounded: "{rounded.full}"
    padding: "4px 9px"
  approval-button:
    backgroundColor: "{colors.approval-background}"
    textColor: "{colors.approval-text}"
    rounded: "{rounded.field}"
    padding: "8px 10px"
  summary-platform:
    rounded: "{rounded.md}"
    padding: "28px 32px"
  history-year-header:
    backgroundColor: "color-mix(in srgb, var(--primary) 6%, var(--bg))"
    rounded: "{rounded.history-group}"
    padding: "20px 24px"
---

# Design System: BreadWinner

## Overview

**Creative North Star: "A calm green workspace"**

BreadWinner's incumbent identity combines fresh green, green-tinted backgrounds, softly rounded controls, and Inter with Manrope. Preserve the existing logo, top navigation, theme support, and shared interaction language. The descriptive north star records the implementation rather than inventing product positioning.

The Home and History extension makes receipt work sleek, elegant, compact, and direct, with less repeated copy and visible editing actions. The pastel-consumer direction (seed 2024013947) is translated into the existing palette and navigation. Home retains its own gradient metrics platform; Home and History now share the receipt row, toolbar, editor, and photo-dialog language. History preserves its calendar-year and month disclosure groups. These scoped extensions are not a sitewide restyle mandate. Camera styling is inherited and remains a distinct treatment; this document does not authorize broader drift repair.

**Key Characteristics:**
- Existing green identity and theme-aware surfaces.
- One dominant Home amount above three supporting metrics.
- Shared Home and History receipt rows with visible review and price editing.
- Native History year/month groups with clear deduction hierarchy.
- Responsive editing with explicit comparison approval.

## Colors

Fresh green supplies actions and emphasis, pale green adds context, and gray-green neutrals carry content. Frontmatter owns the extracted values; CSS custom properties remain the runtime authority.

### Primary
- **Fresh Green** (primary): primary actions, navigation emphasis, and focus.
- **Leaf Green** (primary-hover): light-theme action hover.
- **Pale Mint** (accent-light): approved and contextual surfaces.
- **Forest Green** (accent-deep): strong comparison actions.
- **Workspace Green** (workspace-green): receipt workspace icons and approved status text.
- **Success Green** (success): inherited success feedback.

### Secondary
- **Review Yellow** (review-background, review-text): receipt review status.
- **Approval Amber** (approval-background, approval-text): suggestions awaiting approval.
- **Destructive Red** (destructive): delete and validation feedback.

### Neutral
- **Green Paper**, **White Surface**, and **Quiet Border** (background, card, border): page, controls, and separators.
- **Graphite**, **Soft Gray**, and **Workspace Gray** (text, text-secondary, workspace-muted): content hierarchy. Home and History use stronger muted text for small labels.
- Dark theme uses corresponding dark-* tokens; primary stays green while hover and green supporting text brighten. Dark accent-light is the inherited rgba(var(--accent-rgb), 0.16).

**The Approval Rule.** A suggested comparison stays visually distinct from an approved amount. Its deduction does not count until the user approves it.

## Typography

**Display Font:** Manrope with Inter and system fallbacks.  
**Body Font:** Inter with Manrope and system fallbacks.

The pairing is friendly and restrained. Preserve the logo asset instead of recreating its wordmark. Home and History use moderate weights and compact supporting copy.

### Hierarchy
- **Display:** dominant Home deduction; container-based sizing keeps long values on one line. The smaller-screen cap is (52px).
- **Headline:** Home greeting, reduced on phones (23px).
- **Title:** receipt section heading; editor headings use the body face (14px, 600).
- **Body:** shared defaults; receipt workspace item names and controls are denser (13-14px).
- **Label:** metadata and visible field labels, in sentence case in the workspace.

Metric figures use lining, tabular numerals and fixed digit windows. Currency symbols remain stationary. Initial load rotates digits over (500ms) with the final (200ms) reserved for a smooth landing; later edits update immediately. Reduced motion bypasses this animation.

## Layout

Shared pages use a centered container (1200px maximum), gutters (24px), and phone gutters (16px). Home and History narrow the container (1160px maximum) while retaining top navigation. Home sequences greeting, compact summary, receipt toolbar, and receipt list. History sequences its title/back link, the same toolbar, then year/month receipt groups. The shared receipt-workspace root owns receipt presentation; dashboard-home and dashboard-history retain page-specific structure.

The Home summary puts deduction above three supporting metrics in a single row. The dominant sum and green tonal gradient are explicit user choices, not universal dashboard rules. Desktop padding follows summary-platform; phones use (22px 20px).

Home and History receipt rows share four desktop columns: identity and metadata, deduction, status, and actions. Tracks are minmax(200px, 1fr) 120px 130px 146px with a gap (24px). Below (800px), the middle layout hides the status column. Below (560px), rows use two columns, with status and actions on the second row. Date and item counts remain an identity subline.

Expanded editing pairs a receipt photo with items: minmax(160px, 220px) minmax(0, 1fr), narrowing the photo rail below (1100px). Below (800px), a compact source-photo strip moves above the editor. Phone inputs use a readable size (16px), and name/price forms reflow with labels. Below (860px), an expanded Home receipt hides floating add and bottom navigation. History hides bottom navigation only when the expanded editor is inside both an open year and an open month. History has no Add Receipt control. Collapsing either parent restores the controls even if an editor retains its open state. **Done reviewing** or the row **Close** action closes the editor and restores both controls. Top navigation remains available.

History alone nests native details/summary disclosures by calendar year and month, preserving open state across rendering through the openSections map. Keep calendar-year grouping semantics, filters, sorting, and exports. Headers are concise: **Tax year 2026** and **October**, with **Deduction**, **Receipts**, and **GF items** beneath values. Year summaries use a flat pale-green tint; month summaries stay unboxed. Group-stat tracks are minmax(110px, 1.2fr) repeat(2, minmax(72px, 1fr)) with gaps (28px). Below (700px), stats wrap under the title into three left-aligned columns, with gaps (12px).

## Elevation & Depth

Shared surfaces combine ambient shadows, fine borders, and a green glow on primary actions. Home and History are quieter: receipt rows are flat with separators and toolbar controls have no shadow. Home summary uses tonal depth; History year headers use flat green tint and month groups remain unboxed. Opaque dark-theme hover and open backgrounds keep receipt rows readable.

### Shadow Vocabulary
- **Small:** shared --shadow-sm for restrained inherited surfaces.
- **Medium:** --shadow-md for menus and the Home floating add control.
- **Large:** --shadow-lg for elevated inherited surfaces.
- **Green glow:** --shadow-glow for shared primary actions.

Exact light/dark shadow definitions are in the sidecar and frontend/shared.css. Shared states use the incumbent ease-out curve. Receipt expansion animates grid rows (400ms). Preserve native and user-controlled reduced-motion support.

## Shapes

Shared actions and status labels use pill silhouettes. The shared receipt workspace uses softly squared editing fields (8px) and review/toolbar controls (10px). Home summary corners are (16px); History disclosure headers are (12px). Flat receipt rows have separators rather than individual card outlines. This scoped treatment does not replace the shared radius vocabulary.

## Components

### Buttons

Shared primary actions use Fresh Green, white text, pill corners, and the green glow. Hover darkens in light mode and brightens in dark mode; active state scales (0.97). Shared secondary buttons retain their inherited translucent light fill and border. Home and History toolbar, review, and editor controls use shared workspace corners and dimensions. Preserve visible green focus outlines and red destructive feedback.

### Chips

**Processed** uses green; **Needs Review** uses yellow. Suggested comparison approval actions use amber until approved. Keep text labels so color is never the only status cue.

### Cards / Containers

Shared section cards use the card surface, fine border, large radius, and small shadow. Both receipt lists are flat; expansion reveals a card-colored editor directly below the row. Home summary remains one platform rather than separate metric cards. History wraps lists in native year/month disclosures, with a pale year surface and an unboxed month level.

### Inputs / Fields

Receipt name, item name, paid price, and ZIP fields have visible labels. Paid price is a button showing the amount and a pencil, opening a labeled name/price editor with **Save** and **Cancel**. Search uses a containing focus ring; editor focus shifts the border green with a soft ring. Keep validation feedback, mobile input sizing, and visible receipt/item deletion beside the relevant content. Item keyboard order follows the visual controls: gluten-free toggle, paid-price edit, comparison, then delete. After item removal, focus moves to an adjacent item or the Add Item field.

### Navigation

Preserve the existing BreadWinner logo and top navigation. Desktop links use muted text, green active/hover text, and an animated underline. Existing mobile navigation and account controls remain shared. Only bottom navigation and floating add are temporarily hidden during expanded mobile review.

On Home at mobile widths (860px and below), the existing scan action docks wholly inside the bottom-navigation footprint, leaving receipt delete controls unobscured. Home navigation reserves a fourth visual slot with right padding (70px). The existing fixed scan wrapper sits at bottom calc(19px + env(safe-area-inset-bottom, 0px)), right max(23px, calc((100vw - 340px) / 2 + 7px)), with stacking level (96). Its scan button is (54px square), has no shadow, and hides its main label; camera/upload options retain readable labels and a minimum width (180px). This is a Home-only placement rule. History has no Add Receipt action. Expanded Home review still hides both scan and bottom navigation. On Add Receipt, the mobile pill expands upward to a 192px rounded rectangle with a 28px radius and two 48px photo/camera actions inside; bottom navigation links stay in place. Toggle, outside tap, navigation, action selection or Escape collapses it; Escape returns focus to Add Receipt. The scan wrapper ignores pointer events outside actual buttons so Settings remains tappable. Reduced motion skips the panel transition.

### Home Summary and Receipt Review

Home has one dominant deduction and three smaller metrics below; avoid repeating explanatory copy. Rows expose **Review**, changing to **Close** when open, alongside deduction, status, and metadata. The expanded workspace retains receipt photo preview, renaming, item classification, paid-price editing, removal/addition, and comparison controls. The photo opens a larger dialog.

**Find at Kroger** and **Compare with Kroger** suggest regular alternatives. Suggestions require approval before affecting deduction. Preserve capture, upload, comparison, export, filtering, storage, and theme functionality. Home and History share the same four-column row, editor, and photo-dialog templates through receipt-workspace styling. The gradient summary remains Home-specific, while calendar-year/month grouping remains History-specific. Inherited camera styling is recorded, not redesigned here.

### History Year and Month Disclosures

History uses native disclosure controls with chevrons, visible focus, and preserved open state. The leading deduction is largest at each level: year (26px, 600) and month (20px, 600); supporting year figures are (18px) and month figures (16px). Year deduction reduces on small screens (24px). Group titles are year (18px, 600) and month (16px, 600). Summary hover adds a subtle flat tint, with year primary mix increasing from (6%) to (10%) and month hover at (4%). Preserve the short headings and metric labels rather than repeating group descriptions. Collapsed parent groups must restore mobile add/navigation controls.

## Do's and Don'ts

### Do:
- Do preserve the existing green palette, Inter/Manrope, logo, navigation, and themes.
- Do keep the Home deduction dominant, with three supporting metrics below on a compact gradient platform.
- Do make prices, deletion, comparison, and review visibly actionable and keyboard reachable.
- Do count only approved comparisons.
- Do retain labeled fields, responsive photo placement, reduced motion, and the mobile review exit.
- Do preserve native History year/month disclosures, calendar-year grouping, open-state persistence, filters, and exports.

### Don't:
- Don't turn the Home composition into a sitewide restyle requirement.
- Don't repeat the same explanation across the greeting, summary, and receipt workspace.
- Don't replace explicit review and price editing with unlabeled icon-only discovery.
- Don't redesign inherited camera styling as part of these receipt workspace extensions.
