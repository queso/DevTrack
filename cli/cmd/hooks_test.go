package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// makeGitRepo creates a temp directory with a .git/hooks/ structure to
// simulate a real git repository.
func makeGitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	hooksDir := filepath.Join(dir, ".git", "hooks")
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		t.Fatalf("makeGitRepo: %v", err)
	}
	return dir
}

// hooksDir returns the .git/hooks path for a given repo root.
func hooksDir(repoRoot string) string {
	return filepath.Join(repoRoot, ".git", "hooks")
}

// ---------------------------------------------------------------------------
// generateHookScript tests
// ---------------------------------------------------------------------------

func TestGenerateHookScript_ContainsDevtrackEvent(t *testing.T) {
	script := generateHookScript("post-commit")

	if !strings.Contains(script, "devtrack") {
		t.Error("hook script should contain 'devtrack'")
	}
	if !strings.Contains(script, "event") {
		t.Error("hook script should invoke the 'event' subcommand")
	}
}

func TestGenerateHookScript_HasShebang(t *testing.T) {
	script := generateHookScript("post-commit")

	if !strings.HasPrefix(script, "#!/") {
		t.Errorf("hook script should start with a shebang, got: %q", script[:min(20, len(script))])
	}
}

func TestGenerateHookScript_IncludesHookName(t *testing.T) {
	hookName := "post-checkout"
	script := generateHookScript(hookName)

	// The generated script should reference the hook name so it can pass the
	// right event type to devtrack event.
	if !strings.Contains(script, hookName) && !strings.Contains(script, "checkout") {
		t.Errorf("hook script for %q should reference the hook type, got:\n%s", hookName, script)
	}
}

func TestGenerateHookScript_HasCustomCodeMarkers(t *testing.T) {
	script := generateHookScript("post-commit")

	if !strings.Contains(script, "swagger-jack:custom:start") {
		t.Error("hook script should contain custom code start marker")
	}
	if !strings.Contains(script, "swagger-jack:custom:end") {
		t.Error("hook script should contain custom code end marker")
	}
}

// ---------------------------------------------------------------------------
// installHooks tests
// ---------------------------------------------------------------------------

func TestInstallHooks_WritesHookFiles(t *testing.T) {
	repoRoot := makeGitRepo(t)

	if err := installHooks(repoRoot, false); err != nil {
		t.Fatalf("installHooks returned unexpected error: %v", err)
	}

	// At least one hook should have been installed.
	entries, err := os.ReadDir(hooksDir(repoRoot))
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	if len(entries) == 0 {
		t.Error("expected hook files to be written, but .git/hooks/ is empty")
	}
}

func TestInstallHooks_FilesAreExecutable(t *testing.T) {
	repoRoot := makeGitRepo(t)

	if err := installHooks(repoRoot, false); err != nil {
		t.Fatalf("installHooks returned unexpected error: %v", err)
	}

	entries, err := os.ReadDir(hooksDir(repoRoot))
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}

	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			t.Fatalf("entry.Info for %s: %v", entry.Name(), err)
		}
		if info.Mode()&0o111 == 0 {
			t.Errorf("hook %q should be executable, mode=%v", entry.Name(), info.Mode())
		}
	}
}

func TestInstallHooks_HookScriptCallsDevtrackEvent(t *testing.T) {
	repoRoot := makeGitRepo(t)

	if err := installHooks(repoRoot, false); err != nil {
		t.Fatalf("installHooks returned unexpected error: %v", err)
	}

	entries, err := os.ReadDir(hooksDir(repoRoot))
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	if len(entries) == 0 {
		t.Fatal("no hooks were installed")
	}

	// Inspect the first installed hook to verify it calls devtrack event.
	hookPath := filepath.Join(hooksDir(repoRoot), entries[0].Name())
	content, err := os.ReadFile(hookPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if !strings.Contains(string(content), "devtrack") {
		t.Errorf("installed hook %q should call devtrack, got:\n%s", entries[0].Name(), string(content))
	}
}

func TestInstallHooks_NotAGitRepo(t *testing.T) {
	// A plain temp dir with no .git/ directory.
	notARepo := t.TempDir()

	err := installHooks(notARepo, false)
	if err == nil {
		t.Fatal("expected error when .git/ directory does not exist, got nil")
	}
}

// ---------------------------------------------------------------------------
// uninstallHooks tests
// ---------------------------------------------------------------------------

func TestUninstallHooks_RemovesInstalledHooks(t *testing.T) {
	repoRoot := makeGitRepo(t)

	if err := installHooks(repoRoot, false); err != nil {
		t.Fatalf("installHooks: %v", err)
	}

	// Confirm hooks exist before uninstalling.
	before, err := os.ReadDir(hooksDir(repoRoot))
	if err != nil {
		t.Fatalf("ReadDir before: %v", err)
	}
	if len(before) == 0 {
		t.Fatal("precondition: no hooks installed")
	}

	if err := uninstallHooks(repoRoot, false); err != nil {
		t.Fatalf("uninstallHooks returned unexpected error: %v", err)
	}

	// All devtrack-managed hooks should be gone.
	after, err := os.ReadDir(hooksDir(repoRoot))
	if err != nil {
		t.Fatalf("ReadDir after: %v", err)
	}
	if len(after) != 0 {
		names := make([]string, len(after))
		for i, e := range after {
			names[i] = e.Name()
		}
		t.Errorf("expected .git/hooks/ to be empty after uninstall, remaining: %v", names)
	}
}

func TestUninstallHooks_NotAGitRepo(t *testing.T) {
	notARepo := t.TempDir()

	err := uninstallHooks(notARepo, false)
	if err == nil {
		t.Fatal("expected error when .git/ directory does not exist, got nil")
	}
}

// ---------------------------------------------------------------------------
// Existing hook preservation tests
// ---------------------------------------------------------------------------

func TestInstallHooks_DoesNotOverwriteExistingCustomHook(t *testing.T) {
	repoRoot := makeGitRepo(t)
	existingContent := "#!/bin/sh\n# existing custom hook\nexit 0\n"
	hookPath := filepath.Join(hooksDir(repoRoot), "post-commit")

	if err := os.WriteFile(hookPath, []byte(existingContent), 0o755); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	if err := installHooks(repoRoot, false); err != nil {
		t.Fatalf("installHooks returned unexpected error: %v", err)
	}

	content, err := os.ReadFile(hookPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	// The original custom content must still be present.
	if !strings.Contains(string(content), "existing custom hook") {
		t.Error("installHooks overwrote existing custom hook content — it should preserve or append")
	}
}

func TestUninstallHooks_PreservesExistingCustomContent(t *testing.T) {
	repoRoot := makeGitRepo(t)
	existingContent := "#!/bin/sh\n# my custom script\necho 'hello world'\n"
	hookPath := filepath.Join(hooksDir(repoRoot), "post-commit")

	if err := os.WriteFile(hookPath, []byte(existingContent), 0o755); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	// Install devtrack hooks (appends to existing)
	if err := installHooks(repoRoot, true); err != nil {
		t.Fatalf("installHooks: %v", err)
	}

	// Verify devtrack was appended
	afterInstall, err := os.ReadFile(hookPath)
	if err != nil {
		t.Fatalf("ReadFile after install: %v", err)
	}
	if !strings.Contains(string(afterInstall), "devtrack") {
		t.Fatal("precondition: devtrack not appended to hook")
	}

	// Now uninstall — should strip devtrack but keep custom content
	if err := uninstallHooks(repoRoot, true); err != nil {
		t.Fatalf("uninstallHooks: %v", err)
	}

	afterUninstall, err := os.ReadFile(hookPath)
	if err != nil {
		t.Fatalf("ReadFile after uninstall: %v", err)
	}
	body := string(afterUninstall)

	if !strings.Contains(body, "my custom script") {
		t.Error("uninstall removed custom hook content")
	}
	if !strings.Contains(body, "echo 'hello world'") {
		t.Error("uninstall removed custom script body")
	}
	if strings.Contains(body, "devtrack") {
		t.Error("uninstall did not remove devtrack block")
	}
}

func TestInstallHooks_AppendsToExistingHook(t *testing.T) {
	repoRoot := makeGitRepo(t)
	existingContent := "#!/bin/sh\n# my custom script\nexit 0\n"
	hookPath := filepath.Join(hooksDir(repoRoot), "post-commit")

	if err := os.WriteFile(hookPath, []byte(existingContent), 0o755); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	if err := installHooks(repoRoot, false); err != nil {
		t.Fatalf("installHooks returned unexpected error: %v", err)
	}

	content, err := os.ReadFile(hookPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	body := string(content)

	// After install the file should contain both original content and devtrack call.
	if !strings.Contains(body, "my custom script") {
		t.Error("existing hook content was lost after install")
	}
	if !strings.Contains(body, "devtrack") {
		t.Error("devtrack invocation was not added to existing hook")
	}
}

// ---------------------------------------------------------------------------
// removeDevtrackBlock tests
// ---------------------------------------------------------------------------

// TestRemoveDevtrackBlock_MultipleBlocks verifies that a file containing two
// devtrack blocks (e.g. from two separate install/uninstall cycles that left
// behind a duplicate) has both blocks removed cleanly and that blockLines is
// not leaked between block boundaries.
func TestRemoveDevtrackBlock_MultipleBlocks(t *testing.T) {
	content := "#!/bin/sh\n" +
		devtrackBlockStart + "\n" +
		"devtrack event --type post-commit --message \"post-commit hook fired\" 2>/dev/null || true\n" +
		devtrackBlockEnd + "\n" +
		"# custom line between blocks\n" +
		devtrackBlockStart + "\n" +
		"devtrack event --type pre-push --message \"pre-push hook fired\" 2>/dev/null || true\n" +
		devtrackBlockEnd + "\n" +
		"echo done\n"

	result := removeDevtrackBlock(content)

	if strings.Contains(result, devtrackBlockStart) {
		t.Error("result still contains devtrack start marker after removal")
	}
	if strings.Contains(result, devtrackBlockEnd) {
		t.Error("result still contains devtrack end marker after removal")
	}
	if strings.Contains(result, "devtrack event") {
		t.Error("result still contains devtrack event invocation after removal")
	}
	// Content outside the blocks must be preserved.
	if !strings.Contains(result, "custom line between blocks") {
		t.Error("removeDevtrackBlock removed content that was between two blocks")
	}
	if !strings.Contains(result, "echo done") {
		t.Error("removeDevtrackBlock removed content that was after the last block")
	}
}

// TestRemoveDevtrackBlock_UnclosedBlock verifies that when the end marker is
// missing the captured lines are restored rather than silently dropped, and
// that clearing blockLines on a proper close does not affect the unclosed
// fallback path.
func TestRemoveDevtrackBlock_UnclosedBlockRestoresLines(t *testing.T) {
	content := "#!/bin/sh\n" +
		devtrackBlockStart + "\n" +
		"important content\n"

	result := removeDevtrackBlock(content)

	if !strings.Contains(result, "important content") {
		t.Error("removeDevtrackBlock dropped lines from an unclosed block — they should be restored")
	}
}

// ---------------------------------------------------------------------------
// min helper (Go 1.21 has min builtin, but keep explicit for clarity)
// ---------------------------------------------------------------------------

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
