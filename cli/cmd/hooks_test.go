package cmd

import (
	"encoding/json"
	"errors"
	"os"
	"os/exec"
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
// Claude Code hooks tests
// ---------------------------------------------------------------------------

func TestInstallClaudeCodeHooks_CreatesSettingsFile(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, ".claude", "settings.json")

	if err := installClaudeCodeHooks(settingsPath, true); err != nil {
		t.Fatalf("installClaudeCodeHooks: %v", err)
	}

	if _, err := os.Stat(settingsPath); os.IsNotExist(err) {
		t.Fatal("settings.json was not created")
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	var settings map[string]interface{}
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}

	hooks, ok := settings["hooks"].(map[string]interface{})
	if !ok {
		t.Fatal("settings.json missing hooks key")
	}

	// Should have all 4 event types (SessionEnd added for true session ends).
	for _, event := range []string{"PostToolUse", "SessionStart", "SessionEnd", "Stop"} {
		if _, ok := hooks[event]; !ok {
			t.Errorf("missing hook event: %s", event)
		}
	}
}

// queso/DevTrack issue #14: Claude Code's schema requires each matcher-group
// entry in hooks[event] to nest its command(s) inside a "hooks" array —
// e.g. {"matcher":"Bash","hooks":[{"type":"command","command":"..."}]} —
// not a flat {"command":...,"type":...,"matcher":...} object. A flat shape
// causes Claude Code to reject the entire settings.json, discarding
// unrelated user config. This asserts the installer writes the nested shape
// for every event, with matcher only present where devtrack sets one
// (PostToolUse/Bash), and no top-level command/type keys on the group.
func TestInstallClaudeCodeHooks_WritesNestednHooksShape(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	if err := installClaudeCodeHooks(settingsPath, true); err != nil {
		t.Fatalf("installClaudeCodeHooks: %v", err)
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	var settings map[string]interface{}
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	hooks := settings["hooks"].(map[string]interface{})

	for _, def := range claudeCodeHooks {
		groups, ok := hooks[def.Event].([]interface{})
		if !ok || len(groups) == 0 {
			t.Fatalf("event %s: expected at least one matcher-group entry", def.Event)
		}

		var found bool
		for _, g := range groups {
			group, ok := g.(map[string]interface{})
			if !ok {
				t.Fatalf("event %s: group entry is not an object: %#v", def.Event, g)
			}

			// No top-level command/type keys on the group object itself.
			if _, ok := group["command"]; ok {
				t.Errorf("event %s: group has top-level 'command' key — should be nested under 'hooks': %#v", def.Event, group)
			}
			if _, ok := group["type"]; ok {
				t.Errorf("event %s: group has top-level 'type' key — should be nested under 'hooks': %#v", def.Event, group)
			}

			innerHooks, ok := group["hooks"].([]interface{})
			if !ok {
				t.Fatalf("event %s: group missing 'hooks' array: %#v", def.Event, group)
			}

			for _, h := range innerHooks {
				entry, ok := h.(map[string]interface{})
				if !ok {
					t.Fatalf("event %s: inner hooks entry is not an object: %#v", def.Event, h)
				}
				cmd, _ := entry["command"].(string)
				if cmd != def.Command {
					continue
				}
				found = true

				if entry["type"] != "command" {
					t.Errorf("event %s: expected type=command, got %#v", def.Event, entry["type"])
				}

				wantMatcher := def.Matcher
				gotMatcher, hasMatcher := group["matcher"]
				if wantMatcher == "" {
					if hasMatcher {
						t.Errorf("event %s: unexpected matcher on group (should have none): %v", def.Event, gotMatcher)
					}
				} else {
					if gotMatcher != wantMatcher {
						t.Errorf("event %s: expected matcher %q on group, got %v", def.Event, wantMatcher, gotMatcher)
					}
				}
			}
		}
		if !found {
			t.Errorf("event %s: devtrack command %q not found nested under any group's hooks array", def.Event, def.Command)
		}
	}
}

func TestInstallClaudeCodeHooks_MergesWithExisting(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	existing := `{
  "hooks": {
    "PostToolUse": [
      {"matcher": "Write", "hooks": [{"type": "command", "command": "other-tool check"}]}
    ]
  },
  "permissions": {"allow": ["Read"]}
}`
	if err := os.WriteFile(settingsPath, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := installClaudeCodeHooks(settingsPath, true); err != nil {
		t.Fatalf("installClaudeCodeHooks: %v", err)
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatal(err)
	}

	var settings map[string]interface{}
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatal(err)
	}

	// Other tool's hook should still be present
	hooks := settings["hooks"].(map[string]interface{})
	postToolUse := hooks["PostToolUse"].([]interface{})
	if len(postToolUse) < 2 {
		t.Errorf("expected at least 2 PostToolUse hooks, got %d", len(postToolUse))
	}

	// permissions should be preserved
	if _, ok := settings["permissions"]; !ok {
		t.Error("permissions key was dropped during install")
	}
}

func TestInstallClaudeCodeHooks_Idempotent(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	if err := installClaudeCodeHooks(settingsPath, true); err != nil {
		t.Fatal(err)
	}
	if err := installClaudeCodeHooks(settingsPath, true); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatal(err)
	}

	var settings map[string]interface{}
	json.Unmarshal(data, &settings)
	hooks := settings["hooks"].(map[string]interface{})

	for _, event := range []string{"PostToolUse", "SessionStart", "Stop"} {
		arr := hooks[event].([]interface{})
		devtrackCount := 0
		for _, group := range arr {
			groupMap, ok := group.(map[string]interface{})
			if !ok {
				continue
			}
			innerHooks, ok := groupMap["hooks"].([]interface{})
			if !ok {
				continue
			}
			for _, entry := range innerHooks {
				if m, ok := entry.(map[string]interface{}); ok {
					if cmd, ok := m["command"].(string); ok && strings.Contains(cmd, claudeCodeHookMarker) {
						devtrackCount++
					}
				}
			}
		}
		if devtrackCount != 1 {
			t.Errorf("event %s: expected 1 devtrack hook, got %d", event, devtrackCount)
		}
	}
}

func TestInstallClaudeCodeHooks_PreservesNonHookSettings(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	existing := `{"allowedTools": ["Bash", "Read"], "permissions": {"allow": ["Glob"]}}`
	os.WriteFile(settingsPath, []byte(existing), 0o644)

	if err := installClaudeCodeHooks(settingsPath, true); err != nil {
		t.Fatal(err)
	}

	data, _ := os.ReadFile(settingsPath)
	var settings map[string]interface{}
	json.Unmarshal(data, &settings)

	if _, ok := settings["allowedTools"]; !ok {
		t.Error("allowedTools was dropped")
	}
	if _, ok := settings["permissions"]; !ok {
		t.Error("permissions was dropped")
	}
}

func TestInstallClaudeCodeHooks_RegistersAllEvents(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	installClaudeCodeHooks(settingsPath, true)

	data, _ := os.ReadFile(settingsPath)
	var settings map[string]interface{}
	json.Unmarshal(data, &settings)

	hooks := settings["hooks"].(map[string]interface{})

	expected := map[string]bool{"PostToolUse": false, "SessionStart": false, "Stop": false}
	for event := range expected {
		if _, ok := hooks[event]; ok {
			expected[event] = true
		}
	}
	for event, found := range expected {
		if !found {
			t.Errorf("missing hook event: %s", event)
		}
	}
}

func TestUninstallClaudeCodeHooks_RemovesOnlyDevtrack(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	existing := `{
  "hooks": {
    "PostToolUse": [
      {"matcher": "Write", "hooks": [{"type": "command", "command": "other-tool check"}]},
      {"matcher": "Bash", "hooks": [{"type": "command", "command": "devtrack event --type commit"}]}
    ],
    "SessionStart": [
      {"hooks": [{"type": "command", "command": "devtrack event --type session-start"}]}
    ]
  }
}`
	os.WriteFile(settingsPath, []byte(existing), 0o644)

	if err := uninstallClaudeCodeHooks(settingsPath, true); err != nil {
		t.Fatal(err)
	}

	data, _ := os.ReadFile(settingsPath)
	var settings map[string]interface{}
	json.Unmarshal(data, &settings)

	hooks := settings["hooks"].(map[string]interface{})

	// other-tool hook should remain
	postToolUse := hooks["PostToolUse"].([]interface{})
	if len(postToolUse) != 1 {
		t.Errorf("expected 1 PostToolUse hook remaining, got %d", len(postToolUse))
	}

	// SessionStart should be removed entirely (was only devtrack)
	if _, ok := hooks["SessionStart"]; ok {
		t.Error("SessionStart should have been removed (was only devtrack entries)")
	}
}

func TestUninstallClaudeCodeHooks_PreservesOtherHooks(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	existing := `{
  "hooks": {
    "PostToolUse": [
      {"matcher": "Write", "hooks": [{"type": "command", "command": "lint-check"}]}
    ]
  }
}`
	os.WriteFile(settingsPath, []byte(existing), 0o644)

	if err := uninstallClaudeCodeHooks(settingsPath, true); err != nil {
		t.Fatal(err)
	}

	data, _ := os.ReadFile(settingsPath)
	var settings map[string]interface{}
	json.Unmarshal(data, &settings)

	hooks := settings["hooks"].(map[string]interface{})
	postToolUse := hooks["PostToolUse"].([]interface{})
	if len(postToolUse) != 1 {
		t.Errorf("other tool's hook was removed during uninstall")
	}
}

func TestUninstallClaudeCodeHooks_MissingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nonexistent", "settings.json")
	err := uninstallClaudeCodeHooks(path, true)
	if err != nil {
		t.Fatalf("expected no error for missing file, got: %v", err)
	}
}

func TestUninstallClaudeCodeHooks_CleansUpEmptyHooksKey(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")

	existing := `{
  "hooks": {
    "PostToolUse": [
      {"matcher": "Bash", "hooks": [{"type": "command", "command": "devtrack event --type commit"}]}
    ]
  },
  "other": "value"
}`
	os.WriteFile(settingsPath, []byte(existing), 0o644)

	uninstallClaudeCodeHooks(settingsPath, true)

	data, _ := os.ReadFile(settingsPath)
	var settings map[string]interface{}
	json.Unmarshal(data, &settings)

	if _, ok := settings["hooks"]; ok {
		t.Error("empty hooks key should have been removed")
	}
	if _, ok := settings["other"]; !ok {
		t.Error("non-hooks key was dropped")
	}
}

func TestHooksInstallCmd_HasGitFlag(t *testing.T) {
	f := hooksInstallCmd.Flags().Lookup("git")
	if f == nil {
		t.Fatal("--git flag not found on install command")
	}
}

func TestHooksInstallCmd_HasClaudeCodeFlag(t *testing.T) {
	f := hooksInstallCmd.Flags().Lookup("claude-code")
	if f == nil {
		t.Fatal("--claude-code flag not found on install command")
	}
}

func TestHooksUninstallCmd_HasGitFlag(t *testing.T) {
	f := hooksUninstallCmd.Flags().Lookup("git")
	if f == nil {
		t.Fatal("--git flag not found on uninstall command")
	}
}

func TestHooksUninstallCmd_HasClaudeCodeFlag(t *testing.T) {
	f := hooksUninstallCmd.Flags().Lookup("claude-code")
	if f == nil {
		t.Fatal("--claude-code flag not found on uninstall command")
	}
}

// ---------------------------------------------------------------------------
// WI-006: hooks test subcommand
//
// These tests assume B.A. adds a runHooksTest function:
//
//   func runHooksTest(repoRoot string, settingsPath string, checkHealth func() error, out io.Writer) error
//
// It should:
//   - Check each of gitHookNames exists in repoRoot/.git/hooks/ with devtrack block
//   - Check claude hooks exist in settingsPath
//   - Call checkHealth() to verify API reachability
//   - Write a status report to out
//   - Return non-nil error when: no hooks installed OR API unreachable
// ---------------------------------------------------------------------------

// TestHooksTest_AllInstalledAndAPIReachable verifies that when all hooks are
// installed and the API is healthy, runHooksTest succeeds (nil error) and
// outputs a status report.
func TestHooksTest_AllInstalledAndAPIReachable(t *testing.T) {
	repoRoot := makeGitRepo(t)
	if err := installHooks(repoRoot, true); err != nil {
		t.Fatalf("installHooks: %v", err)
	}

	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")
	if err := installClaudeCodeHooks(settingsPath, true); err != nil {
		t.Fatalf("installClaudeCodeHooks: %v", err)
	}

	healthOK := func() error { return nil }

	var out strings.Builder
	err := runHooksTest(repoRoot, settingsPath, healthOK, &out)
	if err != nil {
		t.Errorf("expected nil error when all hooks installed and API reachable, got: %v", err)
	}

	// Output should mention both git and claude hooks and API.
	got := strings.ToLower(out.String())
	if !strings.Contains(got, "git") && !strings.Contains(got, "hook") {
		t.Errorf("output %q should mention git hooks", out.String())
	}
}

// TestHooksTest_DetectsGitHooksMissing verifies that when git hooks are absent,
// runHooksTest reports them as missing in output.
func TestHooksTest_DetectsGitHooksMissing(t *testing.T) {
	repoRoot := makeGitRepo(t)
	// No hooks installed — .git/hooks/ is empty.

	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")
	if err := installClaudeCodeHooks(settingsPath, true); err != nil {
		t.Fatalf("installClaudeCodeHooks: %v", err)
	}

	healthOK := func() error { return nil }

	var out strings.Builder
	_ = runHooksTest(repoRoot, settingsPath, healthOK, &out)

	got := strings.ToLower(out.String())
	if !strings.Contains(got, "missing") && !strings.Contains(got, "not installed") && !strings.Contains(got, "✗") && !strings.Contains(got, "x") {
		t.Errorf("output %q should indicate git hooks are missing", out.String())
	}
}

// TestHooksTest_DetectsAPIUnreachable verifies that when the health check fails,
// runHooksTest returns a non-nil error and mentions the API in the output.
func TestHooksTest_DetectsAPIUnreachable(t *testing.T) {
	repoRoot := makeGitRepo(t)
	if err := installHooks(repoRoot, true); err != nil {
		t.Fatalf("installHooks: %v", err)
	}

	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")
	if err := installClaudeCodeHooks(settingsPath, true); err != nil {
		t.Fatalf("installClaudeCodeHooks: %v", err)
	}

	healthFail := func() error { return errors.New("connection refused") }

	var out strings.Builder
	err := runHooksTest(repoRoot, settingsPath, healthFail, &out)
	if err == nil {
		t.Error("expected non-nil error when API is unreachable, got nil")
	}

	got := strings.ToLower(out.String())
	if !strings.Contains(got, "api") && !strings.Contains(got, "health") && !strings.Contains(got, "unreachable") {
		t.Errorf("output %q should mention API reachability failure", out.String())
	}
}

// TestHooksTest_ExitsNonZeroWhenNoHooksInstalled verifies that runHooksTest
// returns an error when neither git hooks nor claude code hooks are installed.
func TestHooksTest_ExitsNonZeroWhenNoHooksInstalled(t *testing.T) {
	repoRoot := makeGitRepo(t)
	// No git hooks installed.

	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "nonexistent-settings.json")
	// No claude settings file — no claude hooks.

	healthOK := func() error { return nil }

	var out strings.Builder
	err := runHooksTest(repoRoot, settingsPath, healthOK, &out)
	if err == nil {
		t.Error("expected non-nil error when no hooks are installed at all, got nil")
	}
}

// TestHooksTest_ReportsInstalledHookNames verifies that the output lists the
// individual hook names that are installed vs missing.
func TestHooksTest_ReportsInstalledHookNames(t *testing.T) {
	repoRoot := makeGitRepo(t)
	if err := installHooks(repoRoot, true); err != nil {
		t.Fatalf("installHooks: %v", err)
	}

	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")
	healthOK := func() error { return nil }

	var out strings.Builder
	_ = runHooksTest(repoRoot, settingsPath, healthOK, &out)

	got := out.String()
	// At least one known git hook name should appear in the output.
	foundAny := false
	for _, hookName := range gitHookNames {
		if strings.Contains(got, hookName) {
			foundAny = true
			break
		}
	}
	if !foundAny {
		t.Errorf("output %q should list individual git hook names", got)
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

// ---------------------------------------------------------------------------
// WI-583: hooks emit VALID event types with real git data, and the installer
// upgrades the managed block in place on re-run.
// ---------------------------------------------------------------------------

// AC1-3: each git hook maps to the correct API event type and gathers the right
// git data (subject + hash for commit; branch for push/checkout/merge).
func TestBuildDevtrackBlock_EmitsMappedTypeAndGitData(t *testing.T) {
	cases := []struct {
		hook     string
		wantType string
		wantData []string
	}{
		{"post-commit", "--type commit", []string{"git log -1 --pretty=%s", "git rev-parse HEAD", "--metadata"}},
		{"pre-push", "--type push", []string{"git rev-parse --abbrev-ref HEAD", "--metadata"}},
		{"post-checkout", "--type checkout", []string{"git rev-parse --abbrev-ref HEAD", "--metadata"}},
		{"post-merge", "--type merge", []string{"git rev-parse --abbrev-ref HEAD", "--metadata"}},
	}
	for _, tc := range cases {
		t.Run(tc.hook, func(t *testing.T) {
			block := buildDevtrackBlock(tc.hook)
			if !strings.Contains(block, tc.wantType) {
				t.Errorf("%s block missing %q:\n%s", tc.hook, tc.wantType, block)
			}
			for _, data := range tc.wantData {
				if !strings.Contains(block, data) {
					t.Errorf("%s block missing git data %q:\n%s", tc.hook, data, block)
				}
			}
		})
	}
}

// AC4: no hook emits a raw git-hook name (post-commit/pre-push/post-merge/
// post-checkout) as the --type value — the API would reject those.
func TestBuildDevtrackBlock_NoRawHookNameAsType(t *testing.T) {
	rawNames := []string{"post-commit", "pre-push", "post-merge", "post-checkout"}
	for _, hook := range gitHookNames {
		t.Run(hook, func(t *testing.T) {
			block := buildDevtrackBlock(hook)
			for _, raw := range rawNames {
				if strings.Contains(block, "--type "+raw) {
					t.Errorf("%s hook emits invalid --type %s (raw git-hook name):\n%s", hook, raw, block)
				}
			}
		})
	}
}

// AC5: every hook is non-blocking — failures must not abort the git operation.
func TestBuildDevtrackBlock_NonBlocking(t *testing.T) {
	for _, hook := range gitHookNames {
		t.Run(hook, func(t *testing.T) {
			if !strings.Contains(buildDevtrackBlock(hook), "|| true") {
				t.Errorf("%s block is not non-blocking (missing '|| true')", hook)
			}
		})
	}
}

// PR #13 review: a branch name containing a double quote (legal in git ref
// names) must not break the JSON --metadata argument. This executes the
// generated block for real, under sh, against a stub `devtrack` on PATH, in
// a temp git repo checked out to such a branch, and asserts the exact
// --metadata argument the stub received parses as valid JSON with the exact
// branch name.
func TestBuildDevtrackBlock_EscapesBranchNameContainingDoubleQuote(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
	if _, err := exec.LookPath("sh"); err != nil {
		t.Skip("sh not available")
	}

	repoDir := t.TempDir()
	runGit := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = repoDir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=test", "GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=test", "GIT_COMMITTER_EMAIL=test@example.com",
		)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}

	runGit("init", "-q")
	runGit("commit", "--allow-empty", "-q", "-m", "init")

	branchName := `fix-"bug"`
	runGit("checkout", "-q", "-b", branchName)

	// Stub `devtrack` binary on PATH that records the exact argv it receives,
	// one per line, to the file named by DEVTRACK_STUB_OUT.
	binDir := t.TempDir()
	stubScript := "#!/bin/sh\nfor a in \"$@\"; do printf '%s\\n' \"$a\"; done > \"$DEVTRACK_STUB_OUT\"\n"
	if err := os.WriteFile(filepath.Join(binDir, "devtrack"), []byte(stubScript), 0o755); err != nil {
		t.Fatalf("write stub: %v", err)
	}

	block := buildDevtrackBlock("post-checkout")
	script := "#!/bin/sh\n" + block + "\n"
	scriptPath := filepath.Join(t.TempDir(), "hook.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write script: %v", err)
	}

	capturedPath := filepath.Join(t.TempDir(), "captured.txt")
	cmd := exec.Command("sh", scriptPath)
	cmd.Dir = repoDir
	cmd.Env = append(os.Environ(),
		"PATH="+binDir+":"+os.Getenv("PATH"),
		"DEVTRACK_STUB_OUT="+capturedPath,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("run generated hook script: %v\n%s\nscript:\n%s", err, out, script)
	}

	capturedData, err := os.ReadFile(capturedPath)
	if err != nil {
		t.Fatalf("stub devtrack did not run (or its output was swallowed): %v\nscript:\n%s", err, script)
	}

	args := strings.Split(strings.TrimRight(string(capturedData), "\n"), "\n")
	var metadataValue string
	found := false
	for i, a := range args {
		if a == "--metadata" && i+1 < len(args) {
			metadataValue = args[i+1]
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("no --metadata argument captured; args: %v", args)
	}

	var parsed struct {
		Branch string `json:"branch"`
	}
	if err := json.Unmarshal([]byte(metadataValue), &parsed); err != nil {
		t.Fatalf("--metadata value is not valid JSON: %q, err: %v", metadataValue, err)
	}
	if parsed.Branch != branchName {
		t.Errorf("branch mismatch in parsed metadata: got %q, want %q (raw metadata: %q)", parsed.Branch, branchName, metadataValue)
	}
}

// AC5: re-running the installer replaces a stale managed block in place — the
// block is upgraded (no duplication), and non-devtrack content is preserved.
func TestInstallSingleHook_UpgradesStaleBlockInPlace(t *testing.T) {
	hDir := hooksDir(makeGitRepo(t))
	hookPath := filepath.Join(hDir, "post-commit")

	// Pre-existing file: custom body + a STALE devtrack block emitting the old
	// invalid --type post-commit.
	staleBlock := devtrackBlockStart + "\ndevtrack event --type post-commit --message \"stale\" || true\n" + devtrackBlockEnd
	original := "#!/bin/sh\necho 'my custom hook body'\n" + staleBlock + "\n"
	if err := os.WriteFile(hookPath, []byte(original), 0o755); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	if err := installSingleHook(hDir, "post-commit", true); err != nil {
		t.Fatalf("installSingleHook: %v", err)
	}
	body, err := os.ReadFile(hookPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	got := string(body)

	if n := strings.Count(got, devtrackBlockStart); n != 1 {
		t.Errorf("expected exactly 1 devtrack block after re-install, got %d:\n%s", n, got)
	}
	if strings.Contains(got, "--type post-commit") {
		t.Errorf("stale block not replaced in place (still emits --type post-commit):\n%s", got)
	}
	if !strings.Contains(got, "--type commit") {
		t.Errorf("upgraded block missing --type commit:\n%s", got)
	}
	if !strings.Contains(got, "my custom hook body") {
		t.Errorf("re-install destroyed non-devtrack content:\n%s", got)
	}
}

// The `hooks install` command defaults to git-only: the plugin ships the
// Claude Code hooks, so installing them again into ~/.claude/settings.json
// would double-record every session/tool-use event. This pins that default.
func TestHooksInstallCmd_DefaultsToGitOnly(t *testing.T) {
	repo := makeGitRepo(t)
	home := t.TempDir()
	t.Setenv("HOME", home)

	orig, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	if err := os.Chdir(repo); err != nil {
		t.Fatalf("Chdir: %v", err)
	}
	defer os.Chdir(orig)

	rootCmd.SetArgs([]string{"hooks", "install", "--quiet"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("hooks install: %v", err)
	}
	rootCmd.SetArgs(nil)

	// Git hooks were installed.
	if _, err := os.Stat(filepath.Join(hooksDir(repo), "post-commit")); err != nil {
		t.Errorf("git post-commit hook not installed by default: %v", err)
	}
	// Claude Code settings were NOT touched (plugin owns those hooks).
	if _, err := os.Stat(filepath.Join(home, ".claude", "settings.json")); !os.IsNotExist(err) {
		t.Errorf("default install wrote Claude settings.json (should be plugin-owned); stat err=%v", err)
	}
}

// --claude-code opts back into writing Claude Code hooks (CLI-only setups
// without the plugin).
func TestHooksInstallCmd_ClaudeCodeFlagWritesSettings(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	rootCmd.SetArgs([]string{"hooks", "install", "--claude-code", "--quiet"})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("hooks install --claude-code: %v", err)
	}
	rootCmd.SetArgs(nil)

	if _, err := os.Stat(filepath.Join(home, ".claude", "settings.json")); err != nil {
		t.Errorf("--claude-code did not write settings.json: %v", err)
	}
}
