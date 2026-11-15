# Security

Advisory only. Not certified. Does not replace ATC, ATIS, TCAS or pilot judgment. Not for navigation.

## Please do not file public issues for vulnerabilities

If you find a security issue (for example a way to exfiltrate OpenSky credentials, an injection in a route, or a bug that would silently hide the disclaimer), report it privately through GitHub Security Advisories on this repository. Do not open a public issue and do not include secrets in the report.

This project does not currently offer a paid bug bounty.

## Secrets

Never commit `.env`, `.env.local`, OpenSky client secrets, or Vercel tokens. Rotate any credential that was pushed by accident and mention that in a private report.

## Scope

This is a demo web app. "I can make the predictor disagree with TCAS" is not a vulnerability; the predictor is not certified. Please still report anything that removes safety labeling or exposes credentials.
