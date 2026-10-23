# Legal readiness: US student prototype

Reviewed October 22, 2026. This is an implementation and review record, not an
assertion that every US law applies or that the project has legal certification.
The user confirmed this is a Congressional App Challenge project, intended to
work throughout the US, with no incorporated organization.

## Implemented

- Terms identify the student prototype and remove fictional subscriptions/plans.
  No invented governing state, business address, arbitration waiver, or company
  status. Mandatory consumer rights are preserved.
- Privacy and separate Consumer Health Data policies describe actual receipts,
  health inferences, sources, purposes, named processors, local/cloud storage,
  access limits, retention limitations, withdrawal and request/appeal channels.
- Terms/adult confirmation and sensitive-data processing have separate unchecked
  choices, with server-time versioned records enforced by PostgreSQL RLS and API
  verification. This applies to existing and OAuth accounts. No birthday needed.
- Settings provides export, local clearing, consent withdrawal and cloud account
  deletion. The support mailbox is an alternative for requests without renewed
  consent or when accessibility/authentication barriers prevent self-service.
- Browser-storage inventory reflects actual keys. No advertising/analytics is
  introduced. External font and unused Google Identity requests were removed.
  The Supabase SDK is served locally. No misleading generic accept-all banner.
- Contact form opens a mail draft, preserves the text and explains that the user
  still needs to press Send. It does not falsely claim delivery or an SLA.
- Accessibility contact and a security disclosure contact are public. Public tax
  language describes estimates, not guaranteed tax eligibility or store overcharges.

## Confirm before sharing with real users

1. **Operator/contact:** verify the listed support mailbox is controlled and monitored
   by the student team. Agree which individual handles privacy and incident requests.
   A student project can still have privacy obligations; incorporation is not the
   sole coverage test. If developers are minors, obtain an adult's help with provider
   contracts, contest permissions, and legal commitments.
2. **US scope:** determine whether the actual activity and audience meet each state's
   coverage criteria, including Washington My Health My Data and Nevada consumer
   health laws. Some health-data laws do not depend on the usual large-business
   thresholds. Confirm necessary-service/processor exceptions and whether additional
   sharing consent is required. Do not assume HIPAA is the only relevant law or
   call this app HIPAA compliant. Reassess if serving other countries.
3. **Children:** the account service is adults-only, not the ages of contest entrants.
   If introducing accounts for minors, complete the appropriate COPPA/state child
   privacy analysis and consent design before lowering the age gate. Do not require
   minor judges/viewers to submit personal data; use public pages and synthetic demos.
4. **Providers/retention:** confirm Supabase, Render, frontend host and email provider
   configurations, processor terms, regions, access and backup/log retention. Establish
   and document actual deletion handling, request/appeal deadlines, incident contacts
   and record retention rather than promising unsupported encryption/audit/deletion.
5. **Sensitive data:** keep cloud AI disabled. Adding it requires revised notices,
   provider terms/agreements and appropriate separate consent. A user's checkbox
   cannot override a provider's ban on sensitive submissions to an unpaid service.
6. **Contest/IP:** inspect the tracked receipt dataset, logos, hero image and external
   assets for permission, attribution and privacy. This repo has no identified project
   license; do not invent one without the authors' choice. Check original code/AI
   assistance attribution and other official competition entry requirements.
   See [this session's AI assistance record](AI_ASSISTANCE.md) when preparing the
   full disclosure required by the 2026 rules.
7. **Reliance/marketing:** keep estimates distinct from verified deductions, refunds,
   gluten-free food safety and store pricing violations. Consult current tax guidance.

## Primary references checked

- [2026 Congressional App Challenge rules](https://www.congressionalappchallenge.us/wp-content/uploads/2026/05/2026-CAC-Rules.pdf)
  and [official rules page](https://www.congressionalappchallenge.us/students/rules/).
- [Washington AG: My Health My Data](https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy)
  and [statute RCW 19.373](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373).
- [California AG: CCPA](https://oag.ca.gov/privacy/ccpa): applicability, notices and rights
  require a coverage assessment; not all businesses or projects are covered.
- [Nevada NRS 603A](https://www.leg.state.nv.us/NRS/NRS-603A.html), consumer health data
  provisions, for the state-specific coverage and processor/consent review.
- [FTC: Health Breach Notification Rule](https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0).
  The [September 2026 withdrawal of the obsolete 2021 statement](https://www.ftc.gov/news-events/news/press-releases/2026/09/ftc-withdraws-obsolete-policy-statement)
  does not itself repeal the amended rule; evaluate coverage under the actual rule.
- [Google Gemini API terms](https://ai.google.dev/gemini-api/terms): unpaid sensitive-data
  restrictions and age requirements informed the local-OCR default.
- [ICO storage/access guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/)
  for the distinction between cookies and other device storage; UK rules are not
  represented as automatically applicable to this US project.
- [IRS Publication 502](https://www.irs.gov/publications/p502) for tax limitations.
- [OWASP file uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
  and [Supabase verified users](https://supabase.com/docs/reference/javascript/auth-getuser)
  for technical trust boundaries.
