// Task 3 wires these into the OAuth flow.
#![allow(dead_code)]

use keyring::{Entry, Error};

const SERVICE: &str = "taskrows";

fn entry(user: &str) -> Result<Entry, Error> {
    Entry::new(SERVICE, user)
}

fn set(user: &str, value: &str) -> Result<(), Error> {
    entry(user)?.set_password(value)
}

fn get(user: &str) -> Result<Option<String>, Error> {
    match entry(user)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(e),
    }
}

fn delete(user: &str) -> Result<(), Error> {
    match entry(user)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(e),
    }
}

pub fn set_refresh_token(account_id: &str, token: &str) -> Result<(), Error> {
    set(&format!("refresh:{account_id}"), token)
}

pub fn get_refresh_token(account_id: &str) -> Result<Option<String>, Error> {
    get(&format!("refresh:{account_id}"))
}

pub fn delete_refresh_token(account_id: &str) -> Result<(), Error> {
    delete(&format!("refresh:{account_id}"))
}

pub fn set_client(id: &str, secret: &str) -> Result<(), Error> {
    set("client_id", id)?;
    set("client_secret", secret)
}

pub fn get_client() -> Result<Option<(String, String)>, Error> {
    Ok(match (get("client_id")?, get("client_secret")?) {
        (Some(id), Some(secret)) => Some((id, secret)),
        _ => None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use keyring::credential::{Credential, CredentialApi, CredentialBuilderApi};
    use std::collections::HashMap;
    use std::sync::Mutex;

    // keyring's stock mock keeps the secret inside each Entry, so a fresh
    // Entry::new() never sees an earlier set. This builder shares one store.
    static STORE: Mutex<Option<HashMap<String, Vec<u8>>>> = Mutex::new(None);

    struct SharedCred(String);
    impl CredentialApi for SharedCred {
        fn set_secret(&self, secret: &[u8]) -> keyring::Result<()> {
            STORE.lock().unwrap().get_or_insert_default().insert(self.0.clone(), secret.to_vec());
            Ok(())
        }
        fn get_secret(&self) -> keyring::Result<Vec<u8>> {
            STORE
                .lock()
                .unwrap()
                .get_or_insert_default()
                .get(&self.0)
                .cloned()
                .ok_or(keyring::Error::NoEntry)
        }
        fn delete_credential(&self) -> keyring::Result<()> {
            STORE
                .lock()
                .unwrap()
                .get_or_insert_default()
                .remove(&self.0)
                .map(|_| ())
                .ok_or(keyring::Error::NoEntry)
        }
        fn as_any(&self) -> &dyn std::any::Any {
            self
        }
    }

    struct SharedBuilder;
    impl CredentialBuilderApi for SharedBuilder {
        fn build(&self, _t: Option<&str>, service: &str, user: &str) -> keyring::Result<Box<Credential>> {
            Ok(Box::new(SharedCred(format!("{service}/{user}"))))
        }
        fn as_any(&self) -> &dyn std::any::Any {
            self
        }
    }

    #[test]
    fn secrets_roundtrip_mock() {
        keyring::set_default_credential_builder(Box::new(SharedBuilder));
        set_refresh_token("acc1", "tok").unwrap();
        assert_eq!(get_refresh_token("acc1").unwrap(), Some("tok".to_string()));
        delete_refresh_token("acc1").unwrap();
        assert_eq!(get_refresh_token("acc1").unwrap(), None);
        set_client("id", "secret").unwrap();
        assert_eq!(get_client().unwrap(), Some(("id".to_string(), "secret".to_string())));
    }
}
