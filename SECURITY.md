# Security Policy

## Supported Versions
We maintain `main` actively.

## Reporting a Vulnerability
Please open a private GitHub Security Advisory or email the maintainer.

## Secrets & API Keys
- Never commit `.env` or secrets. `.env` is gitignored.
- Rotate API keys on suspicion or leak.
- In CI, store secrets in Actions → Repository secrets (never in workflow files).

## Device/Runtime
- Use Node LTS from `.nvmrc`.
- Run `npm ci` on clean environments.
- Review new deps on PRs; avoid unknown postinstall scripts.
