# TaskRows — design

**Date:** 2026-11-23  
**Owner:** Kim  
**Status:** **approved by Kim 2026-11-23** (v3: multi-account + merged same-name lists)

## 1. Intent and why

Kim runs several ventures and keeps one Google Tasks list per venture (plus personal
lists). He keeps a **portrait (vertical) monitor** dedicated to tasks. Google's own
Tasks UI shows one list at a time, or lists as horizontal kanban columns; neither fits a
tall, narrow screen. Nothing free on the market fixes this (TasksBoard, Go2Do,
GTasksToolkit and the open-source Tauri client were all checked on 2026-11-23).

TaskRows is a small Windows desktop app that pulls every Google Tasks list and shows
them in **rows stacked top to bottom**. Each row holds one or more lists **side by
side**. Kim arranges lists into rows by drag and drop and the arrangement is remembered.
All task edits sync back to Google Tasks so phone, Gmail and Calendar stay in step.

## 2. Goals

1. Sign in with up to **three Google accounts** (Kim has three); stay signed in across
   restarts. Accounts are added and removed in Settings.
2. Show every Google Tasks list from every signed-in account. Lists with the **same name
   in different accounts are merged into one group** (see §7 "Merged lists"). Lists are
   arranged in rows; rows are added and removed
   freely (no fixed count); a row holds N lists side by side at a fixed list width.
3. Per list: view tasks, add, complete / un-complete, edit title and notes, set or clear
   due date, delete, reorder, move a task to another list. Subtasks shown indented.
4. Two-way sync with Google Tasks by polling. Local edits apply instantly (optimistic)
   and are written to Google immediately.
5. Fast and light: instant UI, low RAM. Target: the whole app process group as shown
   in Task Manager (Tauri exe + its WebView2 helper processes) under **150 MB** idle with
   ~10 lists. The Electron equivalent sits at 250+ MB. (*My call* on the number.)
6. Layout and settings persist locally; window position/size remembered.

## 3. Non-goals (v1)

- Creating new subtasks or changing a task's parent. Existing subtasks are shown,
  completed and reordered among their siblings only (see §7 "Subtasks").
- Offline edit queue. v1 requires network for writes; a failed write reverts and shows a
  toast.
- Reminders / notifications, sharing, Gmail or Calendar integration, mobile, macOS/Linux.
- Moving a task between lists of **different accounts** (Google has no cross-account
  move; lists from different accounts may still share a row).
- Creating / renaming / deleting Google Tasks **lists** from the app (do it in Google;
  the app picks it up on next poll). Cheap to add later.

## 4. Anti-goals

- Anything that makes it heavy: Electron, a bundled Chromium, a CSS framework, a backend
  of our own, or our own database as source of truth. Google Tasks is the source of
  truth; the app caches only.
- A UI that needs horizontal page scrolling. Only a **row** may scroll sideways when it
  holds more lists than fit.

## 5. Constraints

- Windows 11, portrait monitor (roughly 1080 x 1920 or 1440 x 2560). WebView2 is
  present on the machine (verified).
- Rust toolchain and MSVC C++ build tools are **not** installed (verified 2026-11-23).
  Plan step 1 is installing `rustup` (stable, msvc) and VS Build Tools with the
  "Desktop development with C++" workload. Kim approves the install before it runs.
- Node 24.14 / npm 11.9 present. No pnpm.
- Google Tasks API v1 facts that shape the design:
  - No push; must poll. Default quota 50,000 requests/day. With ~10 lists polled every
    60 s that is ~14,400/day. Poll interval must be configurable and polling pauses while
    the window is minimized.
  - `tasks.list` supports `updatedMin`, `showCompleted`, `showHidden`, `showDeleted`,
    `maxResults` (max 100) and pagination.
  - `tasks.move` supports `previous`, `parent` and `destinationTasklist` (cross-list move).
  - Google Tasks has exactly one level of subtasks.
  - Thai text must render correctly (it does in WebView2; use a font stack that includes
    `Segoe UI`, `Leelawadee UI`).
- Kim must create **one** OAuth 2.0 client of type **Desktop app** in a Google Cloud
  project he owns, with the Tasks API enabled. All three accounts sign in through this
  one client, so there is one setup and one shared daily quota. The app asks only for
  scope `https://www.googleapis.com/auth/tasks`.
- **Consent screen: External, pushed to "In production".** (*My call*: Internal would
  only admit users of one Workspace organisation; External covers a mix of personal and
  Workspace accounts.) While it sits in "Testing", Google expires refresh tokens after
  7 days and forces a weekly re-login; "In production" unverified is fine for personal
  use. The plan sequences this before the first end-to-end sign-in test.
- Three accounts cost almost nothing at runtime: polling scales with the number of lists,
  not accounts; each account adds one refresh token and one hourly token refresh. The app still treats "refresh token invalid, sign in again" as a normal,
  non-scary state with a one-click re-login.

## 6. Approaches considered

| # | Approach | Pros | Cons | Verdict |
|---|---|---|---|---|
| 1 | Electron + React + TS | Kim's stack, no new toolchain, easy OAuth | ~150 MB install, 150+ MB RAM | Rejected: Kim asked for best performance and lowest RAM |
| 2 | **Tauri 2 + React + TS** | 5–10 MB install, ~40–70 MB RAM, native Rust shell on system WebView2, instant start | Needs Rust + MSVC build tools installed once; OAuth loopback done in Rust | **Chosen** |
| 3 | Local Node server + pinned browser tab | Fastest to build | Not a desktop app; dies with the server | Rejected |

Kim picked 2 on 2026-11-23 ("best performance, no delay, efficient on RAM").

## 7. Decisions already made (Kim's, unless marked *my call*)

### Layout
- **Rows** stacked vertically, dynamic: "+ Add row" at the bottom; a row's menu has
  "Remove row" (its lists move to the row above, or to the first remaining row).
- **Lists sit side by side** within a row. Each list has a **fixed width** set in
  Settings (default 320 px, *my call*). A row scrolls horizontally when its lists exceed
  the window width; the page itself never scrolls sideways.
- *My call:* rows share the window height equally by default; a drag handle between rows
  resizes them and the split is persisted. Each list's task area scrolls vertically.
- *My call:* a Google list that is not yet placed (new list, or first run) is appended to
  the **first row**. A list deleted in Google disappears from the layout. Layout refers
  to lists by Google `tasklist.id`.
- Drag a **list header** to reorder within a row or drop it into another row. Lists from
  different accounts may share a row. Each list header carries a small **account colour
  dot** (colour assigned per account, shown in Settings) so lists are easy to tell apart.

### Tasks inside a list
- Incomplete tasks in Google's `position` order; subtasks indented under their parent.
- Completed tasks in a collapsible "Completed (n)" section at the bottom of each list,
  collapsed by default (*my call*), with a global "show completed" switch in Settings.
- Due date shown as a chip; overdue in red; today highlighted.
- Interactions: checkbox completes; click title → inline edit; "Add a task" input pinned
  at the top of each list (*my call*: top, because the bottom of a tall column is far
  from the eye); right-click / "⋯" menu → edit notes, set/clear due date (native
  `<input type="date">`), move to list…, delete. Drag a task to reorder within a list or
  drop it on another list (cross-list move via `destinationTasklist`).

### Merged lists (Kim's decision 2026-11-23; rules are *my calls*)
- Lists whose names are equal after trimming and case-folding, across accounts, are shown
  as **one merged list** with one header. The header shows the dots of every account in
  the group. A merged list occupies one slot in the layout; `layout.json` stores it as
  `"merged:<normalised name>"` and the group resolves to its member lists at runtime, so
  adding a third account with the same list name joins the group automatically.
- Inside a merged list, tasks are **grouped by account** in account order, each account
  section keeping Google's `position` order, with a thin divider and the account dot on
  every task. Completed section is shared.
- "Add a task" writes to the **first account's** list by default. The list menu has
  "New tasks go to → <account>", remembered per group in `layout.json`.
- Drag-reorder works only within the same account's section (Google positions are
  per list). Dropping a task on a merged list from elsewhere puts it in the group's
  "new tasks go to" account, and is refused if the source is a different account.
- Settings switch **"Merge same-name lists across accounts"**, default **on**. Turning
  it off splits every group back into separate lists placed in the same row.
- Edits, completion and deletion always act on the task's own account.

### Subtasks (*my calls*)
- A subtask can be dragged only among its siblings (reorder). Dropping it elsewhere is
  refused by the drag constraints, since that would change its parent.
- Dragging a parent to another list carries its children with it. The builder verifies
  whether `tasks.move` with `destinationTasklist` moves children automatically; if it
  does not, the app moves the children explicitly after the parent.
- Ticking a parent completes its children too (matches the Google web UI; the API does
  not cascade, so the app issues the child updates). Un-ticking a parent does not touch
  children.

### Completed tasks (*my call*)
- Only completed tasks from the **last 30 days** are fetched (`completedMin`), so
  "Completed (n)" means "completed in the last 30 days". Old lists with years of history
  stay fast. The window is a constant in code, not a setting, for v1.

### Local cache for instant start (*my call*)
- The last-known lists and tasks are snapshotted to `%APPDATA%\taskrows\cache.json`
  after every successful sync. On launch the board renders from the snapshot at once,
  marked "syncing…" in the footer, then the normal start-up fetch replaces it. Writes are
  disabled until the first sync completes. Sign out deletes the snapshot.

### Sync
- On start: render the cache snapshot if present, then fetch all lists, then all tasks
  per list (`showCompleted=true`, `showHidden=true`, `completedMin` = now − 30 days),
  paginated. Render as data arrives.
- Then poll every `pollIntervalSec` (default 60, min 15) per list, across all accounts,
  with
  `updatedMin = lastSyncIso − 5 min` and `showDeleted=true`, merging by task id. A list
  whose `updated` field is unchanged in `tasklists.list` is skipped (*my call*).
- Also poll immediately when the window regains focus; pause while minimized.
- Writes are optimistic: update local state, call the API, on failure revert and toast.
  The next poll reconciles anything missed.
- Manual "Sync now" button and a last-synced indicator in the footer.

### Auth (multi-account)
- OAuth 2.0 **Authorization Code + PKCE** for an installed app with a **loopback
  redirect** (`http://127.0.0.1:<random port>`). Rust owns the flow: opens the system
  browser, listens once on loopback, exchanges the code. "Add account" in Settings runs
  the flow again; Google's `select_account` prompt lets Kim pick the account.
- Each account is identified by the Google `sub` claim / email from the token's
  `userinfo`. Per account, the refresh token is stored in **Windows Credential Manager**
  (Rust `keyring` crate, entry name `taskrows/<accountId>`). Access tokens live in
  memory only. Frontend calls a Tauri command `get_access_token(accountId)` which
  refreshes transparently.
- Every list and task in the store is keyed by `(accountId, id)`; `layout.json` stores
  `listIds` as `"<accountId>:<tasklistId>"`. Removing an account deletes its credential,
  its lists from the layout and its cached tasks.
- Client ID and client secret are entered once in Settings on first run and stored in
  Credential Manager too (*my call*: not committed to the repo). Google treats desktop
  client secrets as non-confidential, so this is for hygiene, not security.
- "Sign out" clears the stored credentials and the local cache.

### Settings (persisted to `%APPDATA%\taskrows\settings.json`)
accounts (add / remove, colour per account) · merge same-name lists (on/off) ·
list width (px) · poll interval (s) ·
show completed · font size (S/M/L) · always on top · launch at Windows login ·
theme (follow system / light / dark).

Layout persisted to `%APPDATA%\taskrows\layout.json`:
`{ rows: [{ id, heightFraction, listIds: [] }] }`.

### Tech
- Tauri 2 (Rust, stable msvc) + Vite + React 18 + TypeScript.
- Drag and drop: `@dnd-kit/core` + `@dnd-kit/sortable` (*my call*: small, accessible,
  works for both list-headers-between-rows and tasks-between-lists).
- State: a single Zustand store (*my call*; tiny) holding lists, tasks, layout,
  settings, sync status. No React Query.
- Styling: plain CSS with custom properties; light and dark via
  `prefers-color-scheme` plus the manual override. No CSS framework.
- HTTP to Google: from the frontend with `fetch` and the bearer token (Tasks API sends
  CORS headers). Rust does only auth, keyring, file persistence and window state.
- Window state (position/size/monitor) via `tauri-plugin-window-state`.
- Autostart via `tauri-plugin-autostart`. Opener via `tauri-plugin-opener` (OAuth).
- Repo: `C:\Users\kimra\CodingProject\taskrows`, git-initialised, `develop` as the
  working branch. Build output: NSIS installer `TaskRows_x64-setup.exe`.

## 8. Left to the builder

- Component breakdown, file layout, CSS details, icon.
- Group resolution when a member list is renamed in Google (it leaves the group and
  appears as its own list in the first row).
- Exact merge algorithm for poll results (must handle: completed elsewhere, deleted
  elsewhere, reordered elsewhere, moved to another list elsewhere, parent completed
  elsewhere).
- Verify by spike whether skipping unchanged lists via `tasklist.updated` is reliable;
  drop the optimisation if not.
- Error and empty states (no network, token revoked, API quota hit, zero lists).
- Tests: Rust unit tests for token refresh/keyring wrappers; TS unit tests for the merge
  reducer and layout reducer; one smoke run of the built installer.
- How "launch at login" interacts with "start minimized" (builder picks sensible default).

## 9. Done looks like

Kim installs `TaskRows_x64-setup.exe`, pastes his OAuth client ID/secret once, signs in
each of his three accounts in the browser, and the app shows all lists from all three in
rows on the portrait monitor. He drags
lists into the rows he wants, adds and ticks tasks, and sees the same state on his phone
within a minute. Idle RAM for the whole process group under 150 MB. Layout survives restart. Relaunching
shows the board instantly from cache.
