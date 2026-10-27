bread < key

Development checks:

- From `frontend`, run `npm install` once, then `npm run build` after editing TypeScript. The HTML pages serve the generated JavaScript beside each source file.
- From `frontend`, run `npm test` for the receipt persistence and keyboard browser tests. Windows uses installed Microsoft Edge. Elsewhere, run `npx playwright install chromium` first. Set `BROWSER_CHANNEL` to use another installed Playwright browser channel.
- From `backend`, run `python -m pytest test_scan.py -q` for the offline scanner and pricing tests. `test_server.py` also includes live Kroger integration tests that require API credentials and internet access.

Browser tests stub the account, scanner, and price APIs. They do not access real accounts or spend API credits.
