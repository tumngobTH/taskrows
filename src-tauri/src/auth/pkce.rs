use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};

const VERIFIER_LEN: usize = 64;
const STATE_LEN: usize = 32;
/// RFC 7636 unreserved characters.
const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/// Random PKCE code verifier: 64 chars from `[A-Za-z0-9-._~]`.
pub fn generate_verifier() -> String {
    random_string(VERIFIER_LEN)
}

/// Random 32-char `state` value for the auth request (same alphabet as the verifier).
pub fn generate_state() -> String {
    random_string(STATE_LEN)
}

fn random_string(len: usize) -> String {
    (0..len)
        .map(|_| CHARSET[rand::random_range(0..CHARSET.len())] as char)
        .collect()
}

/// S256 code challenge: base64url (no padding) of SHA-256(verifier).
pub fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_rfc7636_vector() {
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        let v = generate_verifier();
        assert_eq!(v.len(), 64);
        assert_ne!(v, generate_verifier());
    }
}
