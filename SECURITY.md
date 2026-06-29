# Security Policy

TreeMonk is **local-first**: your tree, photos and documents live only on your own
computer as a SQLite database plus media files, and nothing is uploaded anywhere.
Even so, we take security and privacy seriously and welcome responsible reports.

## Supported versions

Only the **latest release** is supported with security fixes. Please reproduce
issues on the newest version from the
[Releases page](https://github.com/n1kozor/TreeMonk/releases/latest) before reporting.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately instead, via either:

- GitHub **[private security advisories](https://github.com/n1kozor/TreeMonk/security/advisories/new)**
  (preferred — keeps the report confidential), or
- the contact form at **[treemonk.eu](https://treemonk.eu)**.

Please include:

- a description of the issue and its potential impact,
- step-by-step instructions to reproduce it,
- the affected version and your operating system,
- any proof-of-concept or relevant logs (with personal data removed).

## What to expect

This is a hobby project maintained in spare time, so response times are
best-effort. We will acknowledge your report, investigate, and keep you updated.
Valid issues will be fixed in a subsequent release, and we are happy to credit
reporters who wish to be named. Please give us a reasonable chance to release a
fix before disclosing publicly.

## Scope notes

- Network access is limited and opt-in: FamilySearch import, map tiles, optional
  place geocoding, and the update check. Reports about data leaving the machine
  through any other path are especially welcome.
- Third-party code is vendored under `src/main/python/vendor/` and `node_modules`;
  please report upstream where appropriate, but let us know so we can update.
