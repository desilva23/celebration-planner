# Security policy

## Reporting a vulnerability

Please report security problems privately rather than in a public issue: use **Report a vulnerability** on this repository's **Security** tab. Include what you found, how to reproduce it, and what an attacker could do with it.

## Supported versions

Fixes go to `main`, which is what https://celebration-planner-jade.vercel.app runs. Older commits aren't patched.

## How the app is protected

The details are in the README under [Security](README.md#security). In short:

- API keys stay on the server, and user text never reaches the logs.
- Every request is checked for origin, rate-limited per client, size-capped while it is read, and validated against a schema.
- Pages run under a Content-Security-Policy with a fresh nonce per request, so injected scripts don't run.
- Text people type is fenced as data in prompts, and model replies are schema-checked before use.
- CodeQL scans every push and pull request, and Dependabot proposes dependency updates weekly.
