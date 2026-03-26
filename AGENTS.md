# Agent Instructions

## Prisma startup rule

Before starting implementation work, and before making schema-dependent code changes, every coding agent or LLM working in this repository must run these commands in this order:

```powershell
prisma migrate status
prisma migrate deploy
prisma generate
```

If `prisma generate` fails because the Prisma engine DLL is locked on Windows, clear the lock safely first, then rerun `prisma generate`.

## Forbidden command

Do not use:

```powershell
prisma migrate dev
```

This repository has had migration-history and baseline drift quirks before, so `prisma migrate dev` must be avoided unless the user explicitly asks for it.

## Why this rule exists

- Keeps the database schema aligned with committed migrations.
- Reduces Prisma Client drift issues while coding.
- Avoids reset prompts and misleading drift flows from `migrate dev`.
