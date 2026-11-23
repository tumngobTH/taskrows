//! Tauri command glue. Business logic lives in `auth`, `files` and `secrets`.

use crate::auth::{self, loopback, pkce, token};
use crate::{files, secrets};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;
use token::AuthError;

const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const USERINFO_URL: &str = "https://openidconnect.googleapis.com/v1/userinfo";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(120);
const REFRESH_MARGIN: Duration = Duration::from_secs(60);

pub struct AppState {
    http: reqwest::Client,
    tokens: Mutex<HashMap<String, (String, Instant)>>,
}

impl AppState {
    pub fn new() -> Self {
        Self { http: reqwest::Client::new(), tokens: Mutex::new(HashMap::new()) }
    }

    async fn cache(&self, account_id: &str, t: &token::TokenResponse) {
        let expiry = Instant::now() + Duration::from_secs(t.expires_in);
        self.tokens.lock().await.insert(account_id.to_string(), (t.access_token.clone(), expiry));
    }
}

#[derive(Serialize)]
pub struct AccountInfo {
    id: String,
    email: String,
}

fn auth_err(e: AuthError) -> String {
    match e {
        AuthError::InvalidGrant => "reauth_required".into(),
        other => other.to_string(),
    }
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn get_oauth_client() -> Result<Option<String>, String> {
    Ok(secrets::get_client().map_err(|e| e.to_string())?.map(|(id, _)| id))
}

#[tauri::command]
pub fn set_oauth_client(client_id: String, client_secret: String) -> Result<(), String> {
    secrets::set_client(&client_id, &client_secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_sign_in(app: AppHandle, state: State<'_, AppState>) -> Result<AccountInfo, String> {
    let (client_id, client_secret) = secrets::get_client()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no_client".to_string())?;

    let verifier = pkce::generate_verifier();
    let oauth_state = pkce::generate_state();
    let (listener, port) = loopback::bind().map_err(|e| e.to_string())?;
    let redirect_uri = format!("http://127.0.0.1:{port}");
    let url = auth::build_auth_url(&client_id, &redirect_uri, &pkce::challenge(&verifier), &oauth_state);
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())?;

    let code = loopback::wait_for_code(listener, &oauth_state, SIGN_IN_TIMEOUT).await.map_err(auth_err)?;
    let tokens = token::exchange_code(&state.http, TOKEN_URL, (&client_id, &client_secret), &code, &verifier, &redirect_uri)
        .await
        .map_err(auth_err)?;
    let refresh_token = tokens.refresh_token.as_deref().ok_or_else(|| "no_refresh_token".to_string())?;
    let identity = token::fetch_identity(&state.http, USERINFO_URL, &tokens.access_token).await.map_err(auth_err)?;

    secrets::set_refresh_token(&identity.sub, refresh_token).map_err(|e| e.to_string())?;
    state.cache(&identity.sub, &tokens).await;
    Ok(AccountInfo { id: identity.sub, email: identity.email })
}

#[tauri::command]
pub async fn get_access_token(account_id: String, state: State<'_, AppState>) -> Result<String, String> {
    if let Some((tok, expiry)) = state.tokens.lock().await.get(&account_id)
        && *expiry > Instant::now() + REFRESH_MARGIN
    {
        return Ok(tok.clone());
    }
    let (client_id, client_secret) = secrets::get_client()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no_client".to_string())?;
    let refresh_token = secrets::get_refresh_token(&account_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "reauth_required".to_string())?;
    let tokens = token::refresh(&state.http, TOKEN_URL, (&client_id, &client_secret), &refresh_token)
        .await
        .map_err(auth_err)?;
    state.cache(&account_id, &tokens).await;
    Ok(tokens.access_token)
}

#[tauri::command]
pub async fn remove_account(account_id: String, state: State<'_, AppState>) -> Result<(), String> {
    secrets::delete_refresh_token(&account_id).map_err(|e| e.to_string())?;
    state.tokens.lock().await.remove(&account_id);
    Ok(())
}

#[tauri::command]
pub fn read_json(app: AppHandle, name: String) -> Result<Option<String>, String> {
    files::read_json(&data_dir(&app)?, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_json(app: AppHandle, name: String, content: String) -> Result<(), String> {
    files::write_json(&data_dir(&app)?, &name, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_json(app: AppHandle, name: String) -> Result<(), String> {
    files::delete_json(&data_dir(&app)?, &name).map_err(|e| e.to_string())
}
