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

    // Drain stdout on its own thread, concurrently with waiting for exit —
    // NOT after the child exits. The pipe's OS buffer is small (~64KB on
    // Linux); a probe that writes more than that before exiting blocks in
    // write() until something reads the other end. If nothing reads until
    // try_wait() reports an exit, a chatty probe can never exit, try_wait()
    // never sees it exit, and the loop below burns the full PROBE_TIMEOUT
    // before reporting a false "no version". Do not "simplify" this back to
    // a read-after-wait — that reintroduces the deadlock.
    let (tx, rx) = std::sync::mpsc::channel();
    let reader = child.stdout.take().map(|mut so| {
        std::thread::spawn(move || {
            let mut out = String::new();
            use std::io::Read;
            let _ = so.read_to_string(&mut out);
            let _ = tx.send(out);
        })
    });

    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {
                if start.elapsed() > PROBE_TIMEOUT {
                    kill_probe(&mut child);
                    break None;
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(_) => {
                // The unconditional rx.recv() below only returns once the
                // reader thread hits EOF, which only happens once nothing
                // holds the write end of the stdout pipe open. That is true
                // on the timeout arm above because it kills the child first;
                // it must be true here too, or a wait() failure while the
                // child is still alive would leave the reader blocked
                // forever and this call — inside a Tauri command — hung.
                kill_probe(&mut child);
                break None;
            }
        }
    };

    // The child is gone by now (exited, killed, or unwaitable), so its
    // stdout pipe is closed and the reader thread finishes promptly — join
    // it so no thread is left running past this call.
    let out = rx.recv().unwrap_or_default();
    if let Some(h) = reader {
        let _ = h.join();
    }

    status.map(|s| (s.success(), out.trim().to_string()))
}

// async: up to 8 probes run sequentially, each up to PROBE_TIMEOUT — a plain
// `#[tauri::command]` runs inline on the IPC/UI thread and would freeze the
// window for as long as ~32s. Every other IO-bound command in this crate
// (`compute_probe`, `modal_status`, `probe_endpoint_models`, `probe_large_file`)
// is async for the same reason.
#[tauri::command(async)]
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
            let version = run_probe(&resolved, &p.version_args).and_then(|(_, out)| {
                // Empty stdout is no answer, whatever the exit code — a CLI
                // that exits 0 and prints nothing is "installed, version
                // unknown" (Some("") would render as a blank version, which
                // is a worse signal to the UI than no version at all). A
                // non-empty answer on a non-zero exit still counts: some
                // CLIs print their version before failing an unrelated
                // check.
                if out.is_empty() { None } else { Some(out) }
            });
            let auth_ok = p
                .auth_args
                .as_ref()
                .and_then(|a| run_probe(&resolved, a).map(|(ok, _)| ok));
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

    /// A probe that writes more than the pipe buffer before exiting must not
    /// deadlock: this is the scenario `run_probe`'s reader thread exists for.
    /// Without it, `head`/`tr` would block in write(), never exit, and this
    /// test would stall to PROBE_TIMEOUT (4s) instead of returning promptly.
    #[cfg(unix)]
    #[test]
    fn drains_stdout_from_a_chatty_probe_without_stalling_to_the_timeout() {
        let bin = Path::new("/bin/sh");
        let args = vec![
            "-c".to_string(),
            // 200_000 bytes is well past any realistic OS pipe buffer
            // (~64KB on Linux).
            "head -c 200000 /dev/zero | tr '\\0' 'x'".to_string(),
        ];
        let start = Instant::now();
        let (ok, out) = run_probe(bin, &args).expect("a completed probe returns Some");
        assert!(ok, "the shell pipeline should exit 0");
        assert_eq!(out.len(), 200_000);
        assert!(
            start.elapsed() < PROBE_TIMEOUT,
            "draining concurrently should finish well under the timeout"
        );
    }

    /// authArgs wiring: `detect_agent_clis` must run the entry's OWN auth
    /// probe and report ITS exit status — a separate child process from the
    /// version probe, not a reuse of the version probe's result. Before the
    /// catalog declared any `authArgs` this path never ran at all (no catalog
    /// entry exercised it), which is exactly the "dead code" finding this
    /// guards against.
    #[cfg(unix)]
    #[test]
    fn runs_the_auth_probe_and_reports_its_own_exit_status() {
        let dir = std::env::temp_dir().join(format!("osd-authprobe-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let f = dir.join("fakecli");
        // Models `claude auth status` / `codex login status`: the version
        // probe and the auth probe succeed or fail independently.
        fs::write(
            &f,
            "#!/bin/sh\ncase \"$1\" in\n  --version) echo 1.0.0 ;;\n  signedin) exit 0 ;;\n  *) exit 1 ;;\nesac\n",
        )
        .unwrap();
        fs::set_permissions(&f, fs::Permissions::from_mode(0o755)).unwrap();

        // No other test in this file reads or writes PATH, so this is safe
        // even though cargo runs tests in parallel by default.
        let saved_path = std::env::var("PATH").unwrap_or_default();
        std::env::set_var("PATH", format!("{}:{saved_path}", dir.to_string_lossy()));
        let result = detect_agent_clis(vec![
            CliProbe {
                id: "signed-in".into(),
                bin: "fakecli".into(),
                version_args: vec!["--version".into()],
                auth_args: Some(vec!["signedin".into()]),
            },
            CliProbe {
                id: "signed-out".into(),
                bin: "fakecli".into(),
                version_args: vec!["--version".into()],
                auth_args: Some(vec!["signedout".into()]),
            },
            CliProbe {
                id: "no-auth-probe".into(),
                bin: "fakecli".into(),
                version_args: vec!["--version".into()],
                auth_args: None,
            },
        ]);
        std::env::set_var("PATH", saved_path);
        fs::remove_dir_all(&dir).ok();

        assert_eq!(result[0].auth_ok, Some(true));
        assert_eq!(result[1].auth_ok, Some(false));
        assert_eq!(result[2].auth_ok, None, "no authArgs means unknown, not signed out");
        for r in &result {
            assert_eq!(r.version.as_deref(), Some("1.0.0"));
        }
    }
}
