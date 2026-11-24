# TaskRows Privacy Policy

_Effective date: 24 November 2026. Last updated: 24 November 2026._

The canonical copy of this policy is published at <https://tumngobth.github.io/taskrows/privacy.html>.

TaskRows is a Windows desktop application that displays and edits your Google Tasks lists in rows on a portrait monitor. It is open source and runs entirely on your own computer. There is no TaskRows server, no account with TaskRows, and no TaskRows database.

## 1. Who operates TaskRows

TaskRows is published by its developer at <https://github.com/tumngobTH/taskrows>. You install it yourself and connect it to Google using an OAuth client created in your own Google Cloud project. The developer never receives, sees, or can access your Google data.

## 2. Information TaskRows accesses

| Data | Google scope | Why it is needed |
| --- | --- | --- |
| Google Tasks lists and tasks: list names, titles, notes, due dates, completion, parent/child relationships, ordering | `https://www.googleapis.com/auth/tasks` | To display your lists and to create, edit, complete, move and delete tasks when you ask it to |
| Google account identifier and email address | `openid`, `email` | To label each signed-in account (up to three) and keep each account's tokens separate |

TaskRows does not access contacts, calendar, Drive, Gmail, location, or any other Google data, and requests no other scope.

## 3. How the information is used

- Task data is shown on screen and edited according to your actions; edits are sent back to Google Tasks so they appear on your other devices.
- Your email address is shown next to your account in the account panel and used for nothing else.
- No advertising, analytics, profiling, model training, or any purpose other than operating the task board for you.

## 4. Where the information is stored

- **Task cache:** `%APPDATA%\com.kim.taskrows\cache.json`, so the app starts instantly and works offline. Account labels in `%APPDATA%\com.kim.taskrows\accounts.json`.
- **Credentials:** OAuth refresh tokens and the OAuth client ID/secret you entered are stored in Windows Credential Manager under the service name `taskrows`. Access tokens live in memory only.
- Nothing is stored anywhere other than your own computer and your own Google account.

## 5. Sharing and transfers

TaskRows communicates only with Google's servers (`oauth2.googleapis.com`, `openidconnect.googleapis.com`, `tasks.googleapis.com`). It transmits nothing to the developer or any third party and contains no telemetry, crash reporting, or analytics. Your data is never sold, rented, or shared.

## 6. Google API Services User Data Policy

TaskRows' use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## 7. Retention and deletion

- Signing out an account in TaskRows deletes its refresh token from Credential Manager and removes its lists from the cache.
- Uninstall TaskRows, delete `%APPDATA%\com.kim.taskrows\`, and remove the `taskrows` entries in Windows Credential Manager to remove everything.
- Revoke access at any time at <https://myaccount.google.com/permissions>.
- The developer holds no copy of your data, so there is nothing for the developer to delete.

## 8. Security

OAuth 2.0 with PKCE and a loopback redirect; TaskRows never asks for your Google password. Long-lived tokens live only in the operating system's credential store. All traffic to Google uses HTTPS.

## 9. Children

TaskRows is a general productivity tool and is not directed at children under 13.

## 10. Changes

Changes are published at the address above with an updated date; the repository holds the full history.

## 11. Contact

Open an issue at <https://github.com/tumngobTH/taskrows/issues>, or write to the support email shown on the app's Google sign-in consent screen.
