# Contributing

Thank you for considering a contribution to aethersky. This is a public-good starter. Please keep it safe to fork and honest about what it is not.

## Safety first

Do not remove, soften, or hide the disclaimer:

> Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

Do not describe demo thresholds as regulatory minima. Do not commit secrets.

## How to work

1. Fork the repository, or branch from `main` if you have write access.
2. Open a pull request against `main`. Do not push feature work straight to `main`.
3. Do not deploy to the production Vercel project unless the maintainer asked for that deploy.
4. Run the test suite and a production build locally before you open the PR.
5. Follow [docs/tech-spec.md](docs/tech-spec.md) unless the PR is a documented change to the spec.
6. Use no em dashes in copy, comments, or commit messages.
7. Be kind. Read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## What makes a good PR

- Tests for any change to the conflict engine
- Visible MOCK DATA when the feed is not live
- OpenSky attribution and terms respected
- A short PR description of what changed and how you tested it

## Reporting issues

Use GitHub issues for bugs and ideas. For vulnerabilities, see [SECURITY.md](SECURITY.md).
