pub mod loopback;
pub mod pkce;
pub mod token;

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPE: &str = "openid email https://www.googleapis.com/auth/tasks";

pub fn build_auth_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
    let mut url = url::Url::parse(AUTH_URL).expect("static url");
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent select_account");
    url.into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_auth_url_has_required_params() {
        let url = build_auth_url("cid", "http://127.0.0.1:5555", "CHAL", "ST");
        let parsed = url::Url::parse(&url).unwrap();
        assert_eq!(parsed.as_str().split('?').next().unwrap(), "https://accounts.google.com/o/oauth2/v2/auth");
        let q: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
        assert_eq!(q["client_id"], "cid");
        assert_eq!(q["redirect_uri"], "http://127.0.0.1:5555");
        assert_eq!(q["response_type"], "code");
        assert_eq!(q["scope"], "openid email https://www.googleapis.com/auth/tasks");
        assert_eq!(q["code_challenge"], "CHAL");
        assert_eq!(q["code_challenge_method"], "S256");
        assert_eq!(q["state"], "ST");
        assert_eq!(q["access_type"], "offline");
        assert_eq!(q["prompt"], "consent select_account");
    }
}
