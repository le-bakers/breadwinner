# Validation record

October 22, 2026, local Windows checkout. These results describe source changes and
local checks, not a penetration test or a verification of the deployed accounts.

- **81 Python tests passed**, including receipt parsing and OCR with a synthetic
  fixture, mocked provider behavior, missing/invalid authentication and consent,
  origin/host restrictions, CORS preflight, upload size and chunked-body limits,
  image dimensions/format/metadata removal, finite numeric inputs, bounded limits,
  and the cloud-OCR approval gate. Network calls are blocked in the test suite.
- **2 frontend test suites passed**: built-artifact public-file/CSP checks and a
  real local PostgreSQL engine (PGlite) exercising migration repeatability, two-user
  isolation, cross-account mutations, consent requirements/withdrawal, immutable
  identity/time evidence, anonymous denial and account deletion cascades.
- **TypeScript checking and production build passed.** The build serves a bundled
  auth SDK, retains its dependency licenses, and excludes repo data and source tools.
- **Browser smoke checks passed** in headless Edge: nine public routes, desktop
  layout, mobile health notice/onboarding layout, separate required consent choices,
  dashboard unlocking, settings and a downloaded JSON export without auth token or
  PKCE verifier. Provider calls were intercepted with test responses; no live user
  account or receipt was used. No JavaScript page errors were observed.
- **npm audit and pip-audit found no known vulnerabilities** in the checked
  dependency trees. The initial Python environment's vulnerable pip installer was
  upgraded to 26.2.2. Advisory results are point-in-time and do not rule out unknown
  flaws. Python runtime requirements and npm dependencies are pinned.
- **Supplemental credential pattern scan passed** for tracked and nonignored text
  files; secret values are never printed. Git history, binary receipt content and
  ZIP/editor data were not comprehensively audited. The public Supabase publishable
  key is expected client configuration, not a service-role credential.
- Git whitespace checks passed with CRLF recognized as line endings.

One dependency warning remains: Starlette's test client deprecates its httpx adapter
in favor of httpx2. The test client is a development dependency path; all tests pass.

Still to verify in hosted environments: migration application, exact allowed hosts
and origins, Auth policies and callback URLs, real recovery/OAuth and upload flows,
edge limits/headers, maintainer access, provider retention/deletion behavior and
receipt dataset provenance. See [SECURITY.md](../SECURITY.md).
