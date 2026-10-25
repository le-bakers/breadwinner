# History extension review

Direction inherited from approved Home: Pastel consumer, seed 2024013947, existing BreadWinner green palette and Inter/Manrope. No redraw or new identity; user explicitly requested matching the dashboard receipt list while keeping year/month dropdowns.

Screen question: Which receipt or tax period needs inspection, and what deductions have been approved?

## App critique

1. Hierarchy: year and month names identify the scope; their deduction is the leading number, with receipt/GF counts smaller. Month names omit the already-visible year.
2. Frame: the title, toolbar and year groups share the dashboard's content width. Months are slightly inset, unboxed; receipt identity receives the largest table column.
3. Identity: the existing logo, navigation, font references, colors and both themes remain. Year disclosures use a pale green tone step; no extra metric platform was added to History.
4. Data: native year/month grouping and calendar tax-year boundaries are unchanged. Summary values derive from each group's receipts; price edits, GF changes and approved comparisons refresh both levels.
5. States: native details controls preserve open/closed choices across search and sort. Real zero deductions render as money, unavailable photos have an explicit empty state, and empty searches explain the absence of matches.
6. Actions: the same Review/Close, paid-price editing, item deletion, photo enlargement and Kroger comparison approval flow as Home. Search, sort, receipt deletion confirmation and CSV/Excel options remain.
7. Phone: the editor uses Home's stacked layout and focus mode. Hiding a parent year or month restores navigation/scan access even if its nested editor remains open. The scan button occupies a reserved fourth navigation slot, clearing list actions.

## Evidence

- 205 History browser assertions: 37 desktop plus42 each at820px,390px light,390px dark and320px. Fixtures span two years/four months. Tests cover group state retention, search/sort, reconciled summaries, persisted price edits and invalidating comparisons, mock Kroger approval, GF changes, item add/remove, renaming, photo enlargement, review completion, export options, deletion cancellation and mobile scan placement/restoration.
- 463 dashboard regression assertions passed after extracting shared receipt-workspace selectors.
- TypeScript project validation and six grouping unit tests passed; whitespace check passed.
- History source lint:0FAIL; inherited camera kicker warnings and a scanner warning triggered by box-shadow:none remain, with no shadow actually introduced.
- Independent reviewer initially required the mobile scan-overlap fix; recaptured light/dark mobile and tablet views were scored resolved/ship.
- Before/after Chromium captures are outside production at C:/Users/mwong/breadwinner/.tmp-metrics/history-before-*.png and history-after-*.png. Both sets fit the checked viewport widths. Before had seven receipt columns; after has four, with date/item counts beneath identity. The fixtures differ to exercise multi-period grouping; no receipt-count comparison is claimed.
- The session's standard visual inspector previously timed out through CDP. The working Chromium capture harness and independent screenshot review supplied evidence; no completed standard-inspector verdict is claimed.
- Captures use the existing fallback font because isolated fixtures omit remote font downloads; production font links are unchanged. Sample receipt records/photo exist only in test fixtures. Live OCR, camera permission and actual Kroger service responses were not exercised.
