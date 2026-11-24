# TaskRows privacy policy

_Last updated: 2026-11-24_

TaskRows is a personal Windows desktop application that shows and edits your Google Tasks lists. It is run by you, on your own computer, with an OAuth client you created in your own Google Cloud project. There is no TaskRows server.

## What TaskRows accesses

- Your Google Tasks lists and tasks (titles, notes, due dates, completion, order), through the Google Tasks API, with the `https://www.googleapis.com/auth/tasks` scope.
- Your Google account ID and email address (`openid`, `email` scopes), used only to label each signed-in account inside the app.

## Where your data goes

- Task data and account labels are cached on your computer in `%APPDATA%\taskrows\` so the app can start offline.
- OAuth refresh tokens are stored in Windows Credential Manager on your computer. Access tokens are kept in memory only.
- Data is sent to and received from Google's servers only. TaskRows sends nothing to any other party, and collects no analytics or telemetry.

## Removing your data

- Sign out an account in the app, or uninstall TaskRows, to remove its tokens from Credential Manager and its cache from `%APPDATA%\taskrows\`.
- Revoke the app's access at any time at <https://myaccount.google.com/permissions>.

## Contact

Questions about this policy go to the support email shown on the app's Google consent screen.
