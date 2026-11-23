use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub expires_in: u64,
    pub refresh_token: Option<String>,
    // Part of the brief's response shape; identity comes from userinfo, so nothing reads it.
    #[allow(dead_code)]
    pub id_token: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Deserialize)]
pub struct Identity {
    pub sub: String,
    pub email: String,
}

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("invalid_grant")]
    InvalidGrant,
    /// Network unreachable (connect failure / timeout / no response). The frontend shows "Offline".
    #[error("offline")]
    Offline,
    #[error("{0}")]
    Http(String),
    #[error("{0}")]
    Other(String),
}

impl From<reqwest::Error> for AuthError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_connect() || e.is_timeout() || (e.is_request() && e.status().is_none()) {
            AuthError::Offline
        } else {
            AuthError::Http(e.to_string())
        }
    }
}

#[derive(Deserialize)]
struct ErrorBody {
    error: Option<String>,
}

async fn post_token(http: &reqwest::Client, token_url: &str, form: &[(&str, &str)]) -> Result<TokenResponse, AuthError> {
    let resp = http.post(token_url).form(form).send().await?;
    let status = resp.status();
    if status.is_success() {
        return Ok(resp.json().await?);
    }
    let text = resp.text().await.unwrap_or_default();
    let err = serde_json::from_str::<ErrorBody>(&text).ok().and_then(|b| b.error);
    match err.as_deref() {
        Some("invalid_grant") => Err(AuthError::InvalidGrant),
        _ => Err(AuthError::Http(format!("token endpoint returned {status}: {text}"))),
    }
}

pub async fn exchange_code(
    http: &reqwest::Client,
    token_url: &str,
    client: (&str, &str),
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, AuthError> {
    post_token(
        http,
        token_url,
        &[
            ("client_id", client.0),
            ("client_secret", client.1),
            ("code", code),
            ("code_verifier", verifier),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ],
    )
    .await
}

pub async fn refresh(
    http: &reqwest::Client,
    token_url: &str,
    client: (&str, &str),
    refresh_token: &str,
) -> Result<TokenResponse, AuthError> {
    post_token(
        http,
        token_url,
        &[
            ("client_id", client.0),
            ("client_secret", client.1),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ],
    )
    .await
}

#[derive(Deserialize)]
struct UserInfo {
    sub: String,
    email: Option<String>,
}

pub async fn fetch_identity(http: &reqwest::Client, userinfo_url: &str, access_token: &str) -> Result<Identity, AuthError> {
    let resp = http.get(userinfo_url).bearer_auth(access_token).send().await?;
    let status = resp.status();
    if !status.is_success() {
        return Err(AuthError::Http(format!("userinfo returned {status}")));
    }
    let info: UserInfo = resp.json().await?;
    let email = info.email.ok_or_else(|| AuthError::Other("no_email".into()))?;
    Ok(Identity { sub: info.sub, email })
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{body_string_contains, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn refresh_maps_invalid_grant() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/token"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({"error":"invalid_grant"})))
            .mount(&server)
            .await;
        let r = refresh(&reqwest::Client::new(), &format!("{}/token", server.uri()), ("id", "sec"), "rt").await;
        assert!(matches!(r, Err(AuthError::InvalidGrant)));
    }

    #[tokio::test]
    async fn refresh_unreachable_server_is_offline() {
        // Bind then drop to get a loopback port nothing listens on: connect is refused.
        let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let r = refresh(&reqwest::Client::new(), &format!("http://127.0.0.1:{port}/token"), ("id", "sec"), "rt").await;
        let e = r.unwrap_err();
        assert!(matches!(e, AuthError::Offline), "got {e:?}");
        assert_eq!(e.to_string(), "offline");
    }

    #[tokio::test]
    async fn exchange_code_parses_tokens() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/token"))
            .and(body_string_contains("code_verifier=VER"))
            .and(body_string_contains("grant_type=authorization_code"))
            .and(body_string_contains("code=abc"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "access_token":"at","expires_in":3599,"refresh_token":"rt","id_token":"idt"
            })))
            .mount(&server)
            .await;
        let t = exchange_code(&reqwest::Client::new(), &format!("{}/token", server.uri()), ("id", "sec"), "abc", "VER", "http://127.0.0.1:1")
            .await
            .unwrap();
        assert_eq!(t.access_token, "at");
        assert_eq!(t.expires_in, 3599);
        assert_eq!(t.refresh_token.as_deref(), Some("rt"));
        assert_eq!(t.id_token.as_deref(), Some("idt"));
    }

    #[tokio::test]
    async fn fetch_identity_parses_sub_email() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/userinfo"))
            .and(header("authorization", "Bearer at"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"sub":"123","email":"a@b.com","name":"x"})))
            .mount(&server)
            .await;
        let id = fetch_identity(&reqwest::Client::new(), &format!("{}/userinfo", server.uri()), "at").await.unwrap();
        assert_eq!(id, Identity { sub: "123".into(), email: "a@b.com".into() });
    }
}
