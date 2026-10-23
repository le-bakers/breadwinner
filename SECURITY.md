# Security and deployment

BreadWinner is a student Congressional App Challenge prototype for US adults.
Report suspected vulnerabilities privately to **support.breadwinner@gmail.com**.
Include reproduction steps and affected pages. Do not include real receipts,
passwords, tokens, medical details, or publicly post exploitable personal data.
Only test accounts and systems you control. No bounty or response SLA is promised.

## Required before deploying these changes

1. Run **backend/database.sql** in the intended Supabase project's SQL editor.
   This adds immutable versioned consent records, restrictive consent policies,
   explicit grants and bounded receipt payloads. Existing receipt owners are
   preserved. Existing accounts must make the new choices before viewing receipts.
   Back up and test on a staging database first. `NOT VALID` constraints protect
   changed/new rows; investigate old rows before validating the constraint.
2. Set Render's `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the **same**
   Supabase project configured in `frontend/cloud.ts`. A publishable key is
   intentionally public. Never put a service-role key in the browser.
3. Set `ALLOWED_ORIGINS` to exact production frontend origins, without paths,
   wildcards, or preview-site patterns. For project GitHub Pages, this is
   `https://OWNER.github.io`, not a URL containing the repo name. Set
   `ALLOWED_HOSTS` to the Render hostname and any custom API hostname. Render
   health checks must use an allowed host; verify the health check after deploy.
4. Keep **OCR_ENGINE=local** and **CLOUD_OCR_APPROVED=false**. Gemini receipt
   uploads are disabled by default. Google prohibits sensitive/personal information
   in its unpaid service. Do not enable cloud processing for real receipts without
   reviewing appropriate provider terms, age restrictions, processing agreements,
   disclosure, separate recipient consent if required, and versioned re-consent.
   The current public notices describe local OCR and must change first.
5. Build with `cd frontend; npm ci; npm run build`. Deploy **frontend/_site only**.
   Vercel's project root should be `frontend`; its config supplies security headers.
   GitHub Pages serves a meta CSP, but cannot supply custom frame-ancestors,
   X-Frame-Options, Permissions-Policy or HSTS headers from this repository. Use
   Vercel or a header-capable edge if these guarantees are needed. The CSP allows
   inline **styles** for existing UI behavior; inline scripts/eval are blocked.
6. Configure Supabase Auth: exact production and local callback URLs only, email
   verification, strong password policy (12+ characters), leaked-password checks
   where supported, secure password changes, email-change confirmation, and
   provider rate limits/CAPTCHA. PKCE email links should be opened in the browser
   that requested them. Avoid broad redirect wildcards. Enable MFA on Supabase,
   Render, GitHub, Vercel and the support mailbox for all maintainers.
7. Verify with two separate accounts: each can read/change/delete only its own
   receipts; consent timestamps cannot be supplied by clients; anonymous requests
   fail; withdrawal blocks receipt operations; deletion cascades to receipts and
   consent. Repository tests simulate PostgreSQL rules but do not verify a live
   project's settings or policies added outside this file.
8. Exercise upload, correction, export, withdrawal, deletion, password recovery
   and Google sign-in on the deployed domain. Do not use real sensitive receipts
   for judging or demonstrations. `backend/test_receipt.png` is synthetic.

## Controls and limits

- Expensive endpoints validate bearer sessions with Supabase Auth and require a
  current consent record. Missing or unavailable configuration fails closed.
  Local `breadwinner_session` flags affect navigation only.
- Single-process counters limit 120 requests/minute per peer, 60 provider
  requests/minute per account, and 6 scans/minute per account. Entries are bounded
  and hashed in process memory. Counts reset on restart. One scan runs at a time;
  two upload requests may be active. Public health/deduction routes remain cheap
  and bounded. Multiple workers/instances require a shared limiter and edge rules.
- Uvicorn trusts forwarded IPs only from its configured trusted proxy peers.
  Configure `FORWARDED_ALLOW_IPS` for the actual hosting proxy range after verifying
  it. Do not blindly trust arbitrary X-Forwarded-For. If the peer is shared, the IP
  limit is shared too. Account limits still separate users. Add edge abuse controls
  and provider billing quotas for an Internet-facing deployment.
- Request bodies are capped before multipart parsing (including chunked bodies),
  uploads time out after 20 seconds, images are limited to 6 MiB, 16 million pixels,
  10,000 pixels per side and one frame. Decoded JPEG/PNG/WebP images are normalized
  and stripped of metadata before any OCR. OCR output remains untrusted data.
- TLS, exact origin/host allowlists, no-store API responses, restrictive browser
  CSP, anti-framing headers where supported, no-referrer policy and disabled API
  docs reduce exposure. CORS is not authentication. Infrastructure log retention
  and encryption-at-rest settings must be confirmed with the providers.
- Auth uses PKCE, tab storage by default and persistent storage only after
  Remember me. Browser tokens remain accessible to same-origin scripts; do not
  add unreviewed scripts. Public SDK is bundled locally from locked npm packages.
  Export uses an explicit safe-key allowlist and excludes auth tokens/verifiers.
- Application logs omit upstream response bodies, credentials and query values.
  Render's command disables Uvicorn access logs. Review platform/CDN logs and
  redact query strings; product searches can reveal dietary interests.

## Data already in the repository

**200 receipt JPEGs under `Receipts/` are already tracked in Git.** Their provenance,
licenses and de-identification have not been verified. The new `.gitignore` does
not untrack them or erase previous commits. They are excluded from the public
site build, not from a public repository or source-code export. Before sharing
the repo or submitting source, review ownership, faces, loyalty/payment numbers,
addresses and health clues. Replace with approved synthetic/appropriately licensed
fixtures where necessary. Coordinate any removal/history rewrite with collaborators;
do not rewrite shared history casually. Rotate any credentials previously exposed,
even if deleted from the current tree. `fantasyFRC.zip` and editor data are also
excluded from new tracking and deploy artifacts; they were not opened or modified.

## Dependency and repository protection

Runtime Python dependencies and the npm tree are pinned. CI runs offline tests,
type checking, builds, advisory audits and a scoped credential scan. Dependabot
proposes updates; review and rerun tests before merging. Enable GitHub secret
scanning/push protection, dependency alerts, protected branches and required checks
in repository settings; YAML cannot turn those account features on by itself.
Never run untrusted pull requests with production secrets or `pull_request_target`.
There is no audited penetration test or guarantee of complete security.

## Incident response

Restrict affected routes, revoke compromised credentials/refresh sessions, preserve
minimal evidence with access controls, determine affected users/data/recipients,
and remove the underlying cause. A Supabase sign-out may not invalidate an already
issued access JWT until expiry; follow the provider's documented revocation options.
Assess applicable state breach laws and the FTC Health Breach Notification Rule,
including unauthorized disclosures. Record discovery time and deadlines, obtain
qualified help, notify affected people/regulators when required, and verify restore
and deletion procedures. Do not promise a fixed provider backup deletion period
without confirming the actual plan and settings.
