Password reset setup
===================

Add the exact deployed URL for `resetlink/resetlink.html` to Supabase Authentication → URL Configuration → Redirect URLs. For local development, also add `http://localhost:5500/resetlink/resetlink.html`. Use HTTPS in production, and keep the email template's confirmation link pointed at Supabase's `ConfirmationURL` so Supabase verifies the one-time link before returning to this page.

Settings sends a reset request and opens `/resetlink?sent=1`. The email callback opens the new-password form only after Supabase reports PASSWORD_RECOVERY and verifies the user with the authentication server. An ordinary session or a URL flag alone does not open the form. The extra page-level recovery window lasts 15 minutes and stays in memory; refreshing the form requires opening a fresh email link.

The page suppresses referrers, removes callback credentials from the address after processing, loads no third-party images or fonts, and clears password fields after submission. Successful changes sign out and remove the local recovery credentials. Vercel also sends no-store and anti-framing headers for both page URLs; configure equivalent headers if using another production host. Supabase controls token expiry, one-time link validation, password policy, and email rate limits.
