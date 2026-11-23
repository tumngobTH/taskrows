# Setting up Google sign-in for TaskRows

TaskRows talks to Google Tasks with **your own** Google Cloud OAuth client. You create it once (about 10 minutes, free), then paste its Client ID and Client secret into TaskRows' first screen.

## Steps

1. **Create a project.** Go to <https://console.cloud.google.com/>, click the project picker at the top, choose **New project**, name it `TaskRows`, and click **Create**. Make sure the new project is selected.
2. **Enable the Tasks API.** Open **APIs & Services → Library**, search for **Tasks API**, open it, and click **Enable**.
3. **Configure the OAuth consent screen** (now called **Google Auth Platform**; menu: **APIs & Services → OAuth consent screen**).
   - Click **Get started** if prompted.
   - App name: `TaskRows`. User support email: your own email.
   - Audience / User type: **External**.
   - Contact email: your own email. Accept the policy and **Create**.
4. **Add scopes.** Under **Data Access** (or **Edit app → Scopes**), click **Add or remove scopes** and add:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/tasks`

   Save.
5. **Publish the app.** Under **Audience** (or **OAuth consent screen**), click **Publish app** and confirm. The status must read **In production**.
   - Why this matters: while the status is **Testing**, Google expires refresh tokens after **7 days**, so you would have to sign in again every week. In production the tokens last until you revoke them.
   - You do not need Google verification for personal use. On first sign-in Google shows an **unverified app** warning. This is expected: click **Advanced → Go to TaskRows (unsafe)**, then allow access.
6. **Create the OAuth client.** Open **Credentials → Create credentials → OAuth client ID**.
   - Application type: **Desktop app**.
   - Name: `TaskRows desktop`. Click **Create**.
7. **Copy the Client ID and Client secret** from the dialog (you can reopen them later from **Credentials**).
8. **Paste them into TaskRows.** On its first screen, enter the Client ID and Client secret, click **Save**, then click **Add Google account** and finish sign-in in the browser tab that opens. The tab says "Signed in" when done; return to TaskRows.

## Signing in with up to three accounts

TaskRows shows lists from up to **three** Google accounts. Use the same OAuth client for all of them: open the accounts panel, click **Add account**, and sign in with the next account. Because the app is published (not in Testing), no test-user list is needed. If an account shows **Sign in again**, its access was revoked or expired; click it to sign in once more.

## Troubleshooting

- **`no_client`** — No OAuth client is saved. Enter the Client ID and Client secret on the first screen (step 8).
- **`timeout`** — The browser sign-in was not finished in time (or the browser did not open). Click **Add Google account** again and complete the Google page promptly.
- **`state_mismatch`** — The sign-in response did not match the request (an older tab was used, or two sign-ins overlapped). Close old sign-in tabs and try once more.
- **`no_refresh_token`** — Google did not return a long-lived token, usually because the app was previously authorised. Remove TaskRows at <https://myaccount.google.com/permissions>, then sign in again.
- Any other message — copy it as shown; check that the Tasks API is enabled (step 2) and that the Client ID/secret belong to a **Desktop app** client.
