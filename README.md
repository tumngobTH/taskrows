# TaskRows

## What it is

TaskRows is a Windows desktop app that shows your Google Tasks as a board, built for a portrait monitor. Lists sit side by side in rows, and you can stack as many rows as the screen allows. It supports up to three Google accounts at once, and lists with the same name across accounts are merged into one column. It is a Tauri 2 app (React 19 + TypeScript front end, Rust back end), so it stays light on memory.

## Requirements

- Windows 11 (WebView2 is already included).
- A Google account and your own Google Cloud OAuth client (see First run).

## Install

Run `src-tauri/target/release/bundle/nsis/TaskRows_0.1.0_x64-setup.exe`. It installs per user (no admin rights needed) under `%LOCALAPPDATA%\TaskRows`, with a Start menu entry.

The installer is not code-signed, so Windows SmartScreen may show "Windows protected your PC / Unknown publisher". Click **More info**, then **Run anyway**.

## First run

1. Follow [docs/SETUP-GOOGLE.md](docs/SETUP-GOOGLE.md) to create a Google OAuth client (about 10 minutes, free).
2. On the first screen, paste the Client ID and Client secret and click Save.
3. Click **Add Google account** and finish sign-in in the browser tab that opens. Repeat for up to three accounts.

## Using it

- **Rows:** lists are arranged in rows. Drag the divider between rows to resize a row.
- **Move lists:** drag a list by its header to reorder it or move it to another row.
- **Move tasks:** drag a task by its grip handle to reorder it or move it to another list (within the same account).
- **Task menu:** use the menu on a task to edit its notes, set or clear its due date, and move it to another list of the same account.
- **Merged lists:** when lists from different accounts share a name they appear as one column. Use that list's menu to choose which account's list new tasks go to and to see what is merged.
- **Settings:** open Settings to manage accounts and their colours, merging of same-name lists, showing completed tasks, list width, font size, poll interval, always on top and launch at login.

## Where data lives

Files are in `%APPDATA%\com.kim.taskrows\`:

- `settings.json`
- `layout.json`
- `cache.json`
- `accounts.json`

Sign-in tokens are stored in Windows Credential Manager under the service name `taskrows`, not in these files.

## Development

Requirements: Node 24, Rust stable-msvc 1.85 or newer (the crate uses edition 2024), and the Visual Studio Build Tools with the C++ workload.

```
npm install
npm test            # front-end tests (vitest)
npm run test:rust   # Rust tests
npm run dev:tauri   # run the app in development
npm run build:tauri # build the NSIS installer
```

The Rust scripts run through `scripts/msvc-env.cmd`. It sets up the MSVC x64 environment and puts `%USERPROFILE%\.cargo\bin` on PATH. On the author's machine the newest Windows SDK (10.0.26100) is a broken install, so the wrapper pins SDK 10.0.19041.0. If that Build Tools path is missing it looks for Visual Studio with `vswhere`, and if none is found it simply runs the command as is, so it also works on a normal setup.

The installer is written to `src-tauri/target/release/bundle/nsis/`.

## Measuring RAM

With the app running, run:

```
powershell -ExecutionPolicy Bypass -File scripts/measure-ram.ps1
```

It lists `taskrows.exe` and all its `msedgewebview2.exe` descendants with private working set and working set per process. The acceptance metric is the summed **private working set** of the whole process group (what Task Manager's Processes tab shows), and the script's exit code follows it: 1 if over 150 MB, 2 if the app is not running. The target is under 150 MB. The summed working set is printed as a secondary figure only, because it double-counts pages shared between the WebView2 processes.

- idle, no account: 80 MB private across 7 processes, under the 150 MB target (2026-11-24). Summed working set, double-counted: 376 MB.
- idle with ~10 lists: TBD

## Known limitations

- No offline edit queue: edits need a connection. The cache only shows the last synced state at startup.
- Completed tasks are only fetched for the last 30 days.
- Tasks cannot be moved between accounts.
- Lists are created, renamed and deleted in Google Tasks, not in TaskRows.
- Sync is poll-based, every 60 seconds by default.
