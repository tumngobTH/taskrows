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
5. **Fill in Branding.** Google refuses to publish until the **Branding** page has all four of these; fill them before clicking Publish:
   - **App name**: `TaskRows`.
   - **User support email**: your own email.
   - **App home page**: `https://tumngobth.github.io/taskrows/` (the repository's GitHub Pages site, served from `docs/`).
   - **Privacy policy link**: `https://tumngobth.github.io/taskrows/privacy.html`. Do **not** use a `github.com/.../blob/...` link: GitHub answers automated fetches of those pages with HTTP 503, and Google then reports the policy as "unresponsive".
   - **Authorized domains**: `tumngobth.github.io`. Save.
   - Google may list **Branding verification issues** afterwards (home page "not registered to you", policy "unresponsive" or "insufficient content"). Verification only removes the *unverified app* warning; it is **not** required for the app to be **In production**. To clear it anyway, verify `https://tumngobth.github.io/taskrows/` in [Google Search Console](https://search.google.com/search-console) as a URL-prefix property using the HTML-file method (commit the file to `docs/`), then retry after 24 hours.
6. **Publish the app.** Under **Audience** (or **OAuth consent screen**), click **Publish app** and confirm. The status must read **In production**.
   - Why this matters: while the status is **Testing**, Google expires refresh tokens after **7 days**, so you would have to sign in again every week. In production the tokens last until you revoke them.
   - You do not need Google verification for personal use. On first sign-in Google shows an **unverified app** warning. This is expected: click **Advanced → Go to TaskRows (unsafe)**, then allow access.
7. **Create the OAuth client.** Open **Credentials → Create credentials → OAuth client ID**.
   - Application type: **Desktop app**.
   - Name: `TaskRows desktop`. Click **Create**.
8. **Copy the Client ID and Client secret now.** The secret is shown in full only once, in the dialog that appears after **Create**: copy it immediately, or click **Download JSON** and keep that file. Google does not show it again later; if you lose it, create a new OAuth client (step 7) and use that one.
9. **Paste them into TaskRows.** On its first screen, enter the Client ID and Client secret, click **Save**, then click **Add Google account** and finish sign-in in the browser tab that opens. The tab says "Signed in" when done; return to TaskRows.

## Signing in with up to three accounts

TaskRows shows lists from up to **three** Google accounts. Use the same OAuth client for all of them: open the accounts panel, click **Add account**, and sign in with the next account. Because the app is published (not in Testing), no test-user list is needed. If an account shows **Sign in again**, its access was revoked or expired; click it to sign in once more.

## Troubleshooting

- **"Valid app name, support email, homepage url, and privacy policy url are required for switching the app to external production mode"** — the Branding page is incomplete. Fill all four fields (step 5), save, then click **Publish app** again.
- **`no_client`** — No OAuth client is saved. Enter the Client ID and Client secret on the first screen (step 9).
- **Typo in the Client ID or secret** — Click **Change OAuth client…** on the first screen (or **Settings → OAuth client → Change**) and enter them again. Accounts signed in with the old client may need to sign in again.
- **`denied`** — You clicked **Cancel** (or did not allow access) on the Google page. Click **Add Google account** and allow access.
- **`oauth_error`** — Google reported a sign-in error. Check the Client ID/secret and that the app is published (step 6), then try again.
- **Offline** in the footer — TaskRows could not reach Google. Your cached lists stay visible; if TaskRows started offline, editing is enabled after the first successful sync.
- **`timeout`** — The browser sign-in was not finished in time (or the browser did not open). Click **Add Google account** again and complete the Google page promptly.
- **`state_mismatch`** — The sign-in response did not match the request (an older tab was used, or two sign-ins overlapped). Close old sign-in tabs and try once more.
- **`no_refresh_token`** — Google did not return a long-lived token, usually because the app was previously authorised. Remove TaskRows at <https://myaccount.google.com/permissions>, then sign in again.
- Any other message — copy it as shown; check that the Tasks API is enabled (step 2) and that the Client ID/secret belong to a **Desktop app** client.
