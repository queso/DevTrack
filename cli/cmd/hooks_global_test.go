package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// stubGitConfig replaces the injectable git-config accessors with an in-memory
// map for the duration of a test, and restores them afterwards.
func stubGitConfig(t *testing.T, initial map[string]string) map[string]string {
	t.Helper()
	store := map[string]string{}
	for k, v := range initial {
		store[k] = v
	}
	origGet, origSet, origUnset := gitConfigGetGlobal, gitConfigSetGlobal, gitConfigUnsetGlobal
	gitConfigGetGlobal = func(key string) (string, error) { return store[key], nil }
	gitConfigSetGlobal = func(key, value string) error { store[key] = value; return nil }
	gitConfigUnsetGlobal = func(key string) error { delete(store, key); return nil }
	t.Cleanup(func() {
		gitConfigGetGlobal, gitConfigSetGlobal, gitConfigUnsetGlobal = origGet, origSet, origUnset
	})
	return store
}

func TestBuildGlobalHookScript_TrackedFiresEventAndChains(t *testing.T) {
	script := buildGlobalHookScript("post-commit", "/abs/devtrack")

	if !strings.Contains(script, "event --type commit") {
		t.Errorf("post-commit should fire a commit event:\n%s", script)
	}
	// Prefers PATH, falls back to the baked absolute path.
	if !strings.Contains(script, "command -v devtrack") || !strings.Contains(script, "/abs/devtrack") {
		t.Errorf("post-commit missing devtrack resolution:\n%s", script)
	}
	// Detached so it never delays the commit.
	if !strings.Contains(script, "nohup") || !strings.Contains(script, "&") {
		t.Errorf("event not fired detached:\n%s", script)
	}
	// Chains to the repo-local hook, but skips devtrack-managed ones.
	if !strings.Contains(script, "hooks/post-commit") || !strings.Contains(script, "exec ") {
		t.Errorf("post-commit does not chain to the local hook:\n%s", script)
	}
	if !strings.Contains(script, devtrackBlockStart) {
		t.Errorf("chain does not skip devtrack-managed local hooks:\n%s", script)
	}
}

func TestBuildGlobalHookScript_PushAndMergeTracked(t *testing.T) {
	if s := buildGlobalHookScript("pre-push", "/x"); !strings.Contains(s, "event --type push") {
		t.Errorf("pre-push should fire a push event:\n%s", s)
	}
	if s := buildGlobalHookScript("post-merge", "/x"); !strings.Contains(s, "event --type merge") {
		t.Errorf("post-merge should fire a merge event:\n%s", s)
	}
}

func TestBuildGlobalHookScript_ChainOnlyHasNoEvent(t *testing.T) {
	script := buildGlobalHookScript("pre-commit", "/abs/devtrack")

	if strings.Contains(script, "devtrack event") || strings.Contains(script, "event --type") {
		t.Errorf("chain-only hook must not fire a devtrack event:\n%s", script)
	}
	// It still delegates to a repo-local hook so it is not silently bypassed.
	if !strings.Contains(script, "hooks/pre-commit") || !strings.Contains(script, "exec ") {
		t.Errorf("chain-only hook does not delegate to the local hook:\n%s", script)
	}
}

func TestInstallGlobalHooks_WritesAllHooksAndSetsHooksPath(t *testing.T) {
	store := stubGitConfig(t, nil)
	dir := filepath.Join(t.TempDir(), "git-hooks")

	if err := installGlobalHooks(dir, "/abs/devtrack", false, true); err != nil {
		t.Fatalf("installGlobalHooks: %v", err)
	}

	wantCount := len(globalTrackedHookNames) + len(globalChainOnlyHookNames)
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	if len(entries) != wantCount {
		t.Errorf("wrote %d hooks, want %d", len(entries), wantCount)
	}
	// Every tracked hook exists and is executable.
	for _, name := range globalTrackedHookNames {
		info, err := os.Stat(filepath.Join(dir, name))
		if err != nil {
			t.Errorf("tracked hook %q not written: %v", name, err)
			continue
		}
		if info.Mode()&0o111 == 0 {
			t.Errorf("hook %q is not executable", name)
		}
	}
	if store["core.hooksPath"] != dir {
		t.Errorf("core.hooksPath = %q, want %q", store["core.hooksPath"], dir)
	}
}

func TestInstallGlobalHooks_RefusesConflictingHooksPathWithoutForce(t *testing.T) {
	store := stubGitConfig(t, map[string]string{"core.hooksPath": "/someone/elses/hooks"})
	dir := filepath.Join(t.TempDir(), "git-hooks")

	err := installGlobalHooks(dir, "/abs/devtrack", false, true)
	if err == nil {
		t.Fatal("expected refusal when core.hooksPath points elsewhere")
	}
	if store["core.hooksPath"] != "/someone/elses/hooks" {
		t.Errorf("conflicting hooksPath was overwritten without --force")
	}

	// --force overrides.
	if err := installGlobalHooks(dir, "/abs/devtrack", true, true); err != nil {
		t.Fatalf("installGlobalHooks --force: %v", err)
	}
	if store["core.hooksPath"] != dir {
		t.Errorf("--force did not repoint core.hooksPath: got %q", store["core.hooksPath"])
	}
}

func TestInstallGlobalHooks_AllowsReinstallToSameDir(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "git-hooks")
	stubGitConfig(t, map[string]string{"core.hooksPath": dir})

	if err := installGlobalHooks(dir, "/abs/devtrack", false, true); err != nil {
		t.Fatalf("reinstall to same dir should succeed without --force: %v", err)
	}
}

func TestUninstallGlobalHooks_RemovesManagedOnlyAndUnsets(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "git-hooks")
	store := stubGitConfig(t, nil)
	if err := installGlobalHooks(dir, "/abs/devtrack", false, true); err != nil {
		t.Fatalf("install: %v", err)
	}
	// A foreign (non-devtrack) file must survive uninstall.
	foreign := filepath.Join(dir, "pre-push.local-backup")
	if err := os.WriteFile(foreign, []byte("#!/bin/sh\necho hi\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := uninstallGlobalHooks(dir, true); err != nil {
		t.Fatalf("uninstall: %v", err)
	}

	if _, err := os.Stat(foreign); err != nil {
		t.Errorf("uninstall removed a non-devtrack file: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "post-commit")); !os.IsNotExist(err) {
		t.Errorf("managed hook post-commit was not removed")
	}
	if _, ok := store["core.hooksPath"]; ok {
		t.Errorf("core.hooksPath should have been unset, got %q", store["core.hooksPath"])
	}
}

func TestUninstallGlobalHooks_LeavesForeignHooksPathAlone(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "git-hooks")
	store := stubGitConfig(t, map[string]string{"core.hooksPath": "/other/dir"})
	// Pretend devtrack hooks exist in dir but core.hooksPath points elsewhere.
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(dir, "post-commit"), []byte("#!/bin/sh\n"+globalHookMarker+"\n"), 0o755)

	if err := uninstallGlobalHooks(dir, true); err != nil {
		t.Fatalf("uninstall: %v", err)
	}
	if store["core.hooksPath"] != "/other/dir" {
		t.Errorf("uninstall clobbered a foreign core.hooksPath: %q", store["core.hooksPath"])
	}
}
