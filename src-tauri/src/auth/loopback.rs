use super::token::AuthError;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const MAX_HEAD: usize = 16 * 1024;
const BODY: &str = "Signed in. You can close this tab.";

/// Bind a one-shot listener on an ephemeral loopback port.
pub fn bind() -> std::io::Result<(TcpListener, u16)> {
    let std_listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    std_listener.set_nonblocking(true)?;
    let port = std_listener.local_addr()?.port();
    Ok((TcpListener::from_std(std_listener)?, port))
}

/// Accept exactly one connection and return the OAuth `code` from its query.
pub async fn wait_for_code(listener: TcpListener, expected_state: &str, timeout: Duration) -> Result<String, AuthError> {
    tokio::time::timeout(timeout, accept_one(listener, expected_state))
        .await
        .map_err(|_| AuthError::Other("timeout".into()))?
}

async fn accept_one(listener: TcpListener, expected_state: &str) -> Result<String, AuthError> {
    let (mut stream, _) = listener.accept().await.map_err(|e| AuthError::Other(e.to_string()))?;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];
    while !buf.windows(4).any(|w| w == b"\r\n\r\n") && buf.len() < MAX_HEAD {
        let n = stream.read(&mut chunk).await.map_err(|e| AuthError::Other(e.to_string()))?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{BODY}",
        BODY.len()
    );
    // Best effort: the user-visible page must not mask the real result.
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;

    parse_code(&String::from_utf8_lossy(&buf), expected_state)
}

fn parse_code(head: &str, expected_state: &str) -> Result<String, AuthError> {
    let target = head
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .ok_or_else(|| AuthError::Other("bad_request".into()))?;
    let url = url::Url::parse(&format!("http://127.0.0.1{target}")).map_err(|_| AuthError::Other("bad_request".into()))?;
    let (mut code, mut state, mut error) = (None, None, None);
    for (k, v) in url.query_pairs() {
        match k.as_ref() {
            "code" => code = Some(v.into_owned()),
            "state" => state = Some(v.into_owned()),
            "error" => error = Some(v.into_owned()),
            _ => {}
        }
    }
    if let Some(e) = error {
        return Err(AuthError::Other(e));
    }
    if state.as_deref() != Some(expected_state) {
        return Err(AuthError::Other("state_mismatch".into()));
    }
    code.ok_or_else(|| AuthError::Other("no_code".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::io::AsyncWriteExt;
    use tokio::net::TcpStream;

    async fn hit(port: u16, query: &str) {
        let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        s.write_all(format!("GET /?{query} HTTP/1.1\r\n\r\n").as_bytes()).await.unwrap();
        let mut buf = Vec::new();
        tokio::io::AsyncReadExt::read_to_end(&mut s, &mut buf).await.unwrap();
    }

    #[tokio::test]
    async fn loopback_returns_code_and_rejects_bad_state() {
        let (l, port) = bind().unwrap();
        let h = tokio::spawn(hit(port, "code=abc&state=S1"));
        assert_eq!(wait_for_code(l, "S1", Duration::from_secs(5)).await.unwrap(), "abc");
        h.await.unwrap();

        let (l, port) = bind().unwrap();
        let h = tokio::spawn(hit(port, "code=abc&state=XX"));
        assert!(matches!(wait_for_code(l, "S1", Duration::from_secs(5)).await, Err(AuthError::Other(e)) if e == "state_mismatch"));
        h.await.unwrap();
    }
}
