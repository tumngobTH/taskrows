use std::fs;
use std::io;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum FilesError {
    #[error("invalid file name")]
    BadName,
    #[error(transparent)]
    Io(#[from] io::Error),
}

/// Names must match `^[a-z]+\.json$`.
fn check_name(name: &str) -> Result<(), FilesError> {
    match name.strip_suffix(".json") {
        Some(stem) if !stem.is_empty() && stem.bytes().all(|b| b.is_ascii_lowercase()) => Ok(()),
        _ => Err(FilesError::BadName),
    }
}

pub fn read_json(dir: &Path, name: &str) -> Result<Option<String>, FilesError> {
    check_name(name)?;
    match fs::read_to_string(dir.join(name)) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Atomic: writes `<name>.tmp` then renames over the target.
pub fn write_json(dir: &Path, name: &str, content: &str) -> Result<(), FilesError> {
    check_name(name)?;
    fs::create_dir_all(dir)?;
    let tmp = dir.join(format!("{name}.tmp"));
    fs::write(&tmp, content)?;
    fs::rename(&tmp, dir.join(name))?;
    Ok(())
}

pub fn delete_json(dir: &Path, name: &str) -> Result<(), FilesError> {
    check_name(name)?;
    match fs::remove_file(dir.join(name)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_roundtrip_and_badname() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        assert_eq!(read_json(p, "layout.json").unwrap(), None);
        write_json(p, "layout.json", "{}").unwrap();
        write_json(p, "layout.json", "{\"a\":1}").unwrap();
        assert_eq!(read_json(p, "layout.json").unwrap(), Some("{\"a\":1}".to_string()));
        write_json(p, "layout.json", "{}").unwrap();
        assert_eq!(read_json(p, "layout.json").unwrap(), Some("{}".to_string()));
        delete_json(p, "layout.json").unwrap();
        assert_eq!(read_json(p, "layout.json").unwrap(), None);
        assert!(matches!(write_json(p, "../x.json", ""), Err(FilesError::BadName)));
    }
}
