use super::token::AuthError;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinSet;

const MAX_HEAD: usize = 16 * 1024;
const OK_BODY: &str = "Signed in. You can close this tab.";
const FAIL_BODY: &str = "Sign-in failed. You can close this tab.";

/// Bind a one-shot listener on an ephemeral loopback port.
pub fn bind() -> std::io::Result<(TcpListener, u16)> {
    let std_listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    std_listener.set_nonblocking(true)?;
    let port = std_listener.local_addr()?.port();
    Ok((TcpListener::from_std(std_listener)?, port))
}

/// Wait for the OAuth redirect (`GET /?...`) and return its `code`.
pub async fn wait_for_code(listener: TcpListener, expected_state: &str, timeout: Duration) -> Result<String, AuthError> {
    tokio::time::timeout(timeout, accept_until_callback(listener, expected_state))
        .await
        .map_err(|_| AuthError::Other("timeout".into()))?
}

/// Keeps accepting (browsers open speculative preconnect sockets that may send nothing) and reads
/// connections concurrently until one carries a `GET /?...` request line; others are closed silently.
async fn accept_until_callback(listener: TcpListener, expected_state: &str) -> Result<String, AuthError> {
    let mut pending = JoinSet::new();
    loop {
        tokio::select! {
            accepted = listener.accept() => {
                let (stream, _) = accepted.map_err(|e| AuthError::Other(e.to_string()))?;
                pending.spawn(read_head(stream));
            }
            Some(joined) = pending.join_next(), if !pending.is_empty() => {
                let Ok((mut stream, head)) = joined else { continue };
                let Some(target) = callback_target(&head) else { continue }; // dropping the stream closes it
                let result = parse_code(target, expected_state);
                respond(&mut stream, if result.is_ok() { OK_BODY } else { FAIL_BODY }).await;
                return result;
            }
        }
    }
}

async fn read_head(mut stream: TcpStream) -> (TcpStream, String) {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];
    while !buf.windows(4).any(|w| w == b"\r\n\r\n") && buf.len() < MAX_HEAD {
        match stream.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
        }
    }
    (stream, String::from_utf8_lossy(&buf).into_owned())
}

/// Static page only: nothing from the request is echoed back.
async fn respond(stream: &mut TcpStream, body: &'static str) {
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    // Best effort: the user-visible page must not mask the real result.
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;
}

/// The request target when the request line is `GET /?...` (method GET, path `/`, with a query).
fn callback_target(head: &str) -> Option<&str> {
    let mut parts = head.lines().next()?.split_whitespace();
    let (method, target) = (parts.next()?, parts.next()?);
    (method == "GET" && target.starts_with("/?")).then_some(target)
}

fn parse_code(target: &str, expected_state: &str) -> Result<String, AuthError> {
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
    // State first: nothing in a request we can't tie to our sign-in is trusted, not even its error.
    if state.as_deref() != Some(expected_state) {
        return Err(AuthError::Other("state_mismatch".into()));
    }
    if let Some(e) = error {
        let kind = if e == "access_denied" { "denied" } else { "oauth_error" };
        return Err(AuthError::Other(kind.into()));
    }
    code.ok_or_else(|| AuthError::Other("no_code".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::io::AsyncWriteExt;
    use tokio::net::TcpStream;

    async fn hit(port: u16, query: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        s.write_all(format!("GET /?{query} HTTP/1.1\r\n\r\n").as_bytes()).await.unwrap();
        let mut buf = Vec::new();
        tokio::io::AsyncReadExt::read_to_end(&mut s, &mut buf).await.unwrap();
        String::from_utf8_lossy(&buf).into_owned()
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

    #[tokio::test]
    async fn loopback_ignores_empty_preconnect() {
        let (l, port) = bind().unwrap();
        let h = tokio::spawn(async move {
            // Browser speculative preconnect: opens a socket, sends nothing, closes.
            drop(TcpStream::connect(("127.0.0.1", port)).await.unwrap());
            hit(port, "code=abc&state=S1").await
        });
        assert_eq!(wait_for_code(l, "S1", Duration::from_secs(5)).await.unwrap(), "abc");
        assert!(h.await.unwrap().contains(OK_BODY));
    }

    #[tokio::test]
    async fn loopback_ignores_non_callback_requests() {
        let (l, port) = bind().unwrap();
        let h = tokio::spawn(async move {
            let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
            s.write_all(b"GET /favicon.ico HTTP/1.1\r\n\r\n").await.unwrap();
            let mut buf = Vec::new();
            tokio::io::AsyncReadExt::read_to_end(&mut s, &mut buf).await.unwrap();
            assert!(buf.is_empty(), "non-callback request must be closed silently");
            hit(port, "code=abc&state=S1").await
        });
        assert_eq!(wait_for_code(l, "S1", Duration::from_secs(5)).await.unwrap(), "abc");
        h.await.unwrap();
    }

    #[tokio::test]
    async fn loopback_maps_access_denied_and_shows_failure_page() {
        let (l, port) = bind().unwrap();
        let h = tokio::spawn(hit(port, "error=access_denied&state=S1"));
        assert!(matches!(wait_for_code(l, "S1", Duration::from_secs(5)).await, Err(AuthError::Other(e)) if e == "denied"));
        let page = h.await.unwrap();
        assert!(page.contains(FAIL_BODY) && !page.contains(OK_BODY));

        let (l, port) = bind().unwrap();
        let h = tokio::spawn(hit(port, "error=%3Cscript%3E&state=S1"));
        assert!(matches!(wait_for_code(l, "S1", Duration::from_secs(5)).await, Err(AuthError::Other(e)) if e == "oauth_error"));
        h.await.unwrap();
    }

    #[tokio::test]
    async fn loopback_checks_state_before_error() {
        let (l, port) = bind().unwrap();
        let h = tokio::spawn(hit(port, "error=access_denied&state=XX"));
        assert!(matches!(wait_for_code(l, "S1", Duration::from_secs(5)).await, Err(AuthError::Other(e)) if e == "state_mismatch"));
        h.await.unwrap();
    }
}
