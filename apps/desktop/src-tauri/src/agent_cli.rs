//! Finding the agent CLIs a user already has (Stage 1 of
//! docs/rfc/local-agent-clis.md).
//!
//! The catalog of WHAT to look for lives in TypeScript (`lib/cliCatalog.ts`)
//! and is passed in; this module owns only HOW, because resolving the real
//! PATH and spawning a probe are things the webview cannot do.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use osd_core::runtime::{enriched_path, quiet_command};

/// A probe never gets longer than this. A `--version` call is fast; a binary
/// that hangs must not hang Settings behind it.
const PROBE_TIMEOUT: Duration = Duration::from_millis(4000);

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliProbe {
    pub id: String,
    pub bin: String,
    pub version_args: Vec<String>,
    pub auth_args: Option<Vec<String>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedCli {
    pub id: String,
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    /// None when the entry declares no auth probe — "unknown", not "signed out".
    pub auth_ok: Option<bool>,
}

/// Is this a file we could actually execute?
#[cfg(unix)]
fn is_executable(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(p)
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(p: &Path) -> bool {
    std::fs::metadata(p).map(|m| m.is_file()).unwrap_or(false)
}

/// Resolve `bin` against a PATH-shaped string. Windows carries the extension
/// on the file, not the invocation, so each candidate is tried with the
/// suffixes a shell would add.
pub fn resolve_on_path(bin: &str, path_var: &str) -> Option<PathBuf> {
    #[cfg(windows)]
    let exts: &[&str] = &["", ".exe", ".cmd", ".bat"];
    #[cfg(not(windows))]
    let exts: &[&str] = &[""];

    for dir in std::env::split_paths(path_var) {
        for ext in exts {
            let candidate = dir.join(format!("{bin}{ext}"));
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

/// Kill and reap a probe child that overran `PROBE_TIMEOUT`.
///
/// `osd_core::runtime::kill_child` is NOT this: it kills the one sidecar
/// child tracked in `RuntimeState`, keyed off the app's own lifecycle lock.
/// A probe spawns its own short-lived, untracked `Child`, so ending it is
/// just the two syscalls that function wraps for that other case.
fn kill_probe(child: &mut std::process::Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// Run `bin args…` and return (exit-was-zero, trimmed stdout), or None if it
/// did not finish in time.
fn run_probe(bin: &Path, args: &[String]) -> Option<(bool, String)> {
    let mut child = quiet_command(bin)
        .args(args)
        .env("PATH", enriched_path())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()?;

    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut out = String::new();
                if let Some(mut so) = child.stdout.take() {
                    use std::io::Read;
                    let _ = so.read_to_string(&mut out);
                }
                return Some((status.success(), out.trim().to_string()));
            }
            Ok(None) => {
                if start.elapsed() > PROBE_TIMEOUT {
                    kill_probe(&mut child);
                    return None;
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(_) => return None,
        }
    }
}

#[tauri::command]
pub fn detect_agent_clis(probes: Vec<CliProbe>) -> Vec<DetectedCli> {
    // The enriched PATH, not the inherited one: a GUI-launched app gets a
    // minimal PATH, and an agent CLI is a user-installed binary outside it.
    // Probing the inherited PATH reports "nothing installed" on a normal
    // desktop, which is the most likely way this feature looks broken.
    let path_var = enriched_path();
    probes
        .into_iter()
        .map(|p| {
            let Some(resolved) = resolve_on_path(&p.bin, &path_var) else {
                return DetectedCli {
                    id: p.id,
                    found: false,
                    path: None,
                    version: None,
                    auth_ok: None,
                };
            };
            let version = run_probe(&resolved, &p.version_args).and_then(|(ok, out)| {
                // A CLI that prints its version on a non-zero exit is still
                // installed; only an empty answer is no answer.
                if out.is_empty() && !ok { None } else { Some(out) }
            });
            let auth_ok = p.auth_args.as_ref().and_then(|a| run_probe(&resolved, a).map(|(ok, _)| ok));
            DetectedCli {
                id: p.id,
                found: true,
                path: Some(resolved.to_string_lossy().to_string()),
                version,
                auth_ok,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    /// A file that is present but NOT executable must not count as found:
    /// spawning it would fail later, and reporting it installed sends the user
    /// to configure something that cannot run.
    #[cfg(unix)]
    #[test]
    fn ignores_a_non_executable_file() {
        let dir = std::env::temp_dir().join(format!("osd-probe-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let f = dir.join("fakecli");
        fs::write(&f, "#!/bin/sh\necho 1.0\n").unwrap();
        fs::set_permissions(&f, fs::Permissions::from_mode(0o644)).unwrap();
        assert!(resolve_on_path("fakecli", &dir.to_string_lossy()).is_none());
        fs::set_permissions(&f, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(resolve_on_path("fakecli", &dir.to_string_lossy()).is_some());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn absent_bin_resolves_to_none() {
        assert!(resolve_on_path("definitely-not-a-real-cli-xyz", "/nonexistent").is_none());
    }
}
