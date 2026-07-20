package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// globalHookMarker identifies a devtrack-managed global hook script, both for a
// human reading the file and for uninstall to know which files it owns.
const globalHookMarker = "# devtrack-global-hook (managed by `devtrack hooks install --global`)"

// globalTrackedHookNames are the git hooks whose events we record box-wide.
// Ordered for deterministic output. Kept intentionally small: commit and push
// are high-signal, merge is occasional; post-checkout is deliberately omitted
// (it fires on every branch switch and file checkout, which is pure noise
// across every repo on the machine).
var globalTrackedHookNames = []string{"post-commit", "pre-push", "post-merge"}

// globalChainOnlyHookNames get a passthrough stub with no devtrack event. They
// exist so that, under a global core.hooksPath, a repo's own hook of the same
// name still runs (git consults ONLY core.hooksPath and ignores .git/hooks, so
// without these stubs those local hooks would be silently bypassed).
var globalChainOnlyHookNames = []string{
	"pre-commit", "prepare-commit-msg", "commit-msg", "pre-merge-commit",
	"post-checkout", "pre-rebase", "post-rewrite", "pre-applypatch",
	"applypatch-msg", "post-applypatch", "pre-auto-gc", "push-to-checkout",
	"sendemail-validate",
}

// git config accessors, injectable for tests.
var (
	gitConfigGetGlobal = func(key string) (string, error) {
		out, err := exec.Command("git", "config", "--global", "--get", key).Output()
		if err != nil {
			// `git config --get` exits 1 when the key is unset; that is "empty",
			// not a failure.
			if ee, ok := err.(*exec.ExitError); ok && ee.ExitCode() == 1 {
				return "", nil
			}
			return "", fmt.Errorf("git config --get %s: %w", key, err)
		}
		return strings.TrimSpace(string(out)), nil
	}
	gitConfigSetGlobal = func(key, value string) error {
		return exec.Command("git", "config", "--global", key, value).Run()
	}
	gitConfigUnsetGlobal = func(key string) error {
		// --unset exits 5 when the key is already absent; that is a no-op success.
		err := exec.Command("git", "config", "--global", "--unset", key).Run()
		if ee, ok := err.(*exec.ExitError); ok && ee.ExitCode() == 5 {
			return nil
		}
		return err
	}
)

// globalHooksDir is where devtrack writes its global hook scripts. It lives
// under ~/.devtrack (alongside config.yaml) so it is clearly devtrack-owned.
func globalHooksDir(home string) string {
	return filepath.Join(home, ".devtrack", "git-hooks")
}

// resolveDevtrackPath returns an absolute path to the running devtrack binary,
// baked into the hooks as a fallback for git contexts where devtrack is not on
// PATH. The scripts prefer `command -v devtrack` (so a PATH install keeps
// auto-updating) and fall back to this path.
func resolveDevtrackPath() string {
	p, err := os.Executable()
	if err != nil {
		return "devtrack"
	}
	if resolved, err := filepath.EvalSymlinks(p); err == nil {
		p = resolved
	}
	return p
}

// globalFireBlock returns the shell that records a devtrack event for a tracked
// hook, or "" for a chain-only hook. It assumes $_dt holds an executable
// devtrack path. The event is fired detached (nohup ... &) so it never delays
// the git operation, and best-effort (output discarded).
func globalFireBlock(hookName string) string {
	// Branch capture is a two-step (assign, then interpolate) to avoid nested
	// quoting: a branch name may legally contain double quotes, so it is
	// JSON-escaped through sed before landing in the metadata literal.
	branchBlock := func(etype, msg string) string {
		return strings.Join([]string{
			`  _dt_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null | sed 's/\\/\\\\/g; s/"/\\"/g')`,
			`  _dt_meta="{\"branch\":\"$_dt_branch\"}"`,
			`  nohup "$_dt" event --type ` + etype + ` --message "` + msg + `" --metadata "$_dt_meta" --quiet >/dev/null 2>&1 &`,
		}, "\n")
	}

	switch hookName {
	case "post-commit":
		return strings.Join([]string{
			`  _dt_msg=$(git log -1 --pretty=%s 2>/dev/null)`,
			`  _dt_meta="{\"hash\":\"$(git rev-parse HEAD 2>/dev/null)\"}"`,
			`  nohup "$_dt" event --type commit --message "$_dt_msg" --metadata "$_dt_meta" --quiet >/dev/null 2>&1 &`,
		}, "\n")
	case "pre-push":
		return branchBlock("push", "pre-push hook fired")
	case "post-merge":
		return branchBlock("merge", "post-merge hook fired")
	}
	return ""
}

// buildGlobalHookScript returns the full script for one global hook. Tracked
// hooks fire a devtrack event and then delegate; chain-only hooks just delegate.
// Delegation runs the repo-local hook of the same name UNLESS it is a
// devtrack-managed hook (a per-repo install) — otherwise a repo that also has
// per-repo devtrack hooks would record every event twice.
func buildGlobalHookScript(hookName, devtrackPath string) string {
	var b strings.Builder
	b.WriteString("#!/bin/sh\n")
	b.WriteString(globalHookMarker + "\n")

	if fire := globalFireBlock(hookName); fire != "" {
		b.WriteString(`_dt="$(command -v devtrack 2>/dev/null || echo '` + devtrackPath + `')"` + "\n")
		b.WriteString(`if [ -x "$_dt" ]; then` + "\n")
		b.WriteString(fire + "\n")
		b.WriteString("fi\n")
	}

	b.WriteString(`_dt_local="$(git rev-parse --git-dir 2>/dev/null)/hooks/` + hookName + `"` + "\n")
	b.WriteString(`if [ -x "$_dt_local" ] && ! grep -q "` + devtrackBlockStart + `" "$_dt_local" 2>/dev/null; then` + "\n")
	b.WriteString(`  exec "$_dt_local" "$@"` + "\n")
	b.WriteString("fi\n")
	b.WriteString("exit 0\n")
	return b.String()
}

// installGlobalHooks writes every global hook script into hooksDir and points
// git's global core.hooksPath at it. It refuses to clobber a core.hooksPath
// that is already set to some OTHER directory unless force is set.
func installGlobalHooks(hooksDir, devtrackPath string, force, quiet bool) error {
	current, err := gitConfigGetGlobal("core.hooksPath")
	if err != nil {
		return err
	}
	if current != "" && current != hooksDir && !force {
		return fmt.Errorf(
			"global core.hooksPath is already set to %q; refusing to overwrite.\n"+
				"Re-run with --force to repoint it at %q, or unset it first with:\n"+
				"  git config --global --unset core.hooksPath",
			current, hooksDir)
	}

	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		return fmt.Errorf("create global hooks dir %q: %w", hooksDir, err)
	}

	all := append(append([]string{}, globalTrackedHookNames...), globalChainOnlyHookNames...)
	for _, name := range all {
		path := filepath.Join(hooksDir, name)
		if err := os.WriteFile(path, []byte(buildGlobalHookScript(name, devtrackPath)), 0o755); err != nil {
			return fmt.Errorf("write global hook %q: %w", path, err)
		}
	}

	if err := gitConfigSetGlobal("core.hooksPath", hooksDir); err != nil {
		return fmt.Errorf("set global core.hooksPath: %w", err)
	}

	if !quiet {
		fmt.Printf("Installed %d global git hooks in %s\n", len(all), hooksDir)
		fmt.Printf("Set core.hooksPath = %s\n", hooksDir)
		fmt.Println("Tracking commits, pushes, and merges across all repositories.")
		fmt.Println("Note: repos with their own core.hooksPath (e.g. husky) are not covered;")
		fmt.Println("run `devtrack hooks install` inside those to track them per-repo.")
	}
	return nil
}

// uninstallGlobalHooks removes the devtrack-managed hook files from hooksDir and
// unsets core.hooksPath when it still points at hooksDir. Files it does not own
// (no devtrack marker) are left untouched.
func uninstallGlobalHooks(hooksDir string, quiet bool) error {
	current, err := gitConfigGetGlobal("core.hooksPath")
	if err != nil {
		return err
	}

	entries, err := os.ReadDir(hooksDir)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("read global hooks dir %q: %w", hooksDir, err)
	}
	removed := 0
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		path := filepath.Join(hooksDir, e.Name())
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			continue
		}
		if strings.Contains(string(data), globalHookMarker) {
			if err := os.Remove(path); err != nil {
				return fmt.Errorf("remove global hook %q: %w", path, err)
			}
			removed++
		}
	}
	// Remove the dir only if now empty (leaves foreign files and their dir alone).
	_ = os.Remove(hooksDir)

	if current == hooksDir {
		if err := gitConfigUnsetGlobal("core.hooksPath"); err != nil {
			return fmt.Errorf("unset global core.hooksPath: %w", err)
		}
	}

	if !quiet {
		fmt.Printf("Removed %d global git hooks from %s\n", removed, hooksDir)
		if current == hooksDir {
			fmt.Println("Unset core.hooksPath.")
		}
	}
	return nil
}
