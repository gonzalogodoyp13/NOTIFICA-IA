# Codex Reinstall Handoff

This file is a compact project briefing for a fresh Codex install or a new thread.

## Project

- Workspace: `C:\Users\gonza\Desktop\NOTIFICA IA - WEB - (2)`
- App name: `notifica-ia`
- Framework: Next.js 14 / React 18 / TypeScript / Tailwind
- Database tooling: Prisma
- Local dev server: `npm run dev`
- App URL used in troubleshooting: `http://127.0.0.1:3000`
- Confirmed app title from HTTP probe: `NOTIFICA IA - Sistema de Gestión`

## Repository Rules

Follow `AGENTS.md` before implementation work.

Important Prisma startup rule from `AGENTS.md`:

```powershell
prisma migrate status
prisma migrate deploy
prisma generate
```

Do not use:

```powershell
prisma migrate dev
```

If Prisma Client generation fails because a Windows DLL is locked, clear the lock safely and rerun `prisma generate`.

## Useful Commands

```powershell
npm run dev
npm run build
npm run lint
npm run db:status
npm run db:migrate
npm run db:generate
```

Package scripts are defined in `package.json`.

## Current Connectivity Issue

The app itself is reachable on port 3000. Shell HTTP probing returned:

```text
Status: 200 OK
Title: NOTIFICA IA - Sistema de Gestión
```

The failure is not the Next app, npm, Chrome login, or port 3000.

The failing layer is Codex's local Browser/Chrome/Computer Use automation runtime on Windows.

Observed error:

```text
node_repl kernel exited unexpectedly
windows sandbox failed: spawn setup refresh
```

Fresh sandbox logs repeatedly showed:

```text
C:\Users\gonza\AppData\Local\OpenAI\Codex\bin\716dda49c14d31a0\codex-windows-sandbox-setup.exe
The requested operation requires elevation. (os error 740)
```

Important detail:

```text
Packaged helper from Program Files\WindowsApps works.
Copied helper from AppData\Local\OpenAI\Codex\bin fails.
```

This points to a Codex Windows desktop runtime/install/trust issue, not a project bug.

## Troubleshooting Already Tried

- Confirmed port 3000 responds with HTTP 200.
- Confirmed Node/npm dev server is running.
- Tried Browser plugin / in-app browser.
- Tried Chrome extension path.
- Tried Computer Use helper.
- Tried launching Chrome directly to `http://127.0.0.1:3000`.
- Tried Codex repair from Windows Settings.
- Tried opening Codex as Administrator.
- Renamed/rebuilt `C:\Users\gonza\AppData\Local\OpenAI\Codex\bin`.
- Renamed/rebuilt `.codex\.sandbox-bin`.
- Renamed/restored plugin cache folders:
  - `browser`
  - `chrome`
  - `computer-use`
- Added Defender exclusions for:
  - `C:\Users\gonza\AppData\Local\OpenAI\Codex`
  - `C:\Users\gonza\.codex`
- Checked Defender: no active threat detections were shown from the readout.
- Smart App Control was reported already disabled.
- Tried a per-file `RUNASINVOKER` compatibility flag for the copied setup helper; it did not fix the issue.

## Recommended Next Step

Before uninstalling or reinstalling Codex, back up:

```text
C:\Users\gonza\.codex\sessions
C:\Users\gonza\.codex\config.toml
C:\Users\gonza\.codex\plugins
```

Then reinstall/update Codex. After reinstall, reopen this repo and ask Codex to read:

```text
CODEX_REINSTALL_HANDOFF.md
AGENTS.md
package.json
prisma/schema.prisma
```

## Notes For Future Codex

- Do not assume Browser/Chrome automation works until `node_repl` can execute a trivial command.
- First smoke test should be:

```js
nodeRepl.write(JSON.stringify({ ok: true, cwd: nodeRepl.cwd }, null, 2));
```

- If that fails with `windows sandbox failed: spawn setup refresh`, do not spend time debugging Chrome or the app.
- If that succeeds, then retry Browser/Chrome automation against `http://127.0.0.1:3000`.
