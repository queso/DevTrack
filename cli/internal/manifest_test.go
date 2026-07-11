package internal

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// NOTE (WI-579): the manifest filename is devtrack.yaml. devtrack.yaml is a legacy
// name that must never be read; tests below that write devtrack.yaml assert it is
// ignored.

// writeFile creates a file at path with the given content.
func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("writeFile: %v", err)
	}
}

// ---------------------------------------------------------------------------
// ReadManifest tests
// ---------------------------------------------------------------------------

func TestReadManifest_AllFields(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "devtrack.yaml")
	writeFile(t, path, `
name: my-project
workflow: sdlc
domain: engineering
tags:
  - backend
  - api
repo_url: https://github.com/example/my-project
main_branch: main
prd_path: prd/
`)

	m, err := ReadManifest(path)
	if err != nil {
		t.Fatalf("ReadManifest returned unexpected error: %v", err)
	}

	if m.Name != "my-project" {
		t.Errorf("Name: got %q, want %q", m.Name, "my-project")
	}
	if m.Workflow != "sdlc" {
		t.Errorf("Workflow: got %q, want %q", m.Workflow, "sdlc")
	}
	if m.Domain != "engineering" {
		t.Errorf("Domain: got %q, want %q", m.Domain, "engineering")
	}
	if len(m.Tags) != 2 || m.Tags[0] != "backend" || m.Tags[1] != "api" {
		t.Errorf("Tags: got %v, want [backend api]", m.Tags)
	}
	if m.RepoURL != "https://github.com/example/my-project" {
		t.Errorf("RepoURL: got %q, want %q", m.RepoURL, "https://github.com/example/my-project")
	}
	if m.MainBranch != "main" {
		t.Errorf("MainBranch: got %q, want %q", m.MainBranch, "main")
	}
	if m.PrdPath != "prd/" {
		t.Errorf("PrdPath: got %q, want %q", m.PrdPath, "prd/")
	}
}

func TestReadManifest_OnlyRequiredFields(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "devtrack.yaml")
	writeFile(t, path, `
name: minimal-project
`)

	m, err := ReadManifest(path)
	if err != nil {
		t.Fatalf("ReadManifest returned unexpected error: %v", err)
	}
	if m.Name != "minimal-project" {
		t.Errorf("Name: got %q, want %q", m.Name, "minimal-project")
	}
	if m.Workflow != "sdlc" {
		t.Errorf("Workflow: got %q, want %q", m.Workflow, "sdlc")
	}
	// Optional fields should be zero values.
	if m.Domain != "" {
		t.Errorf("Domain: expected empty, got %q", m.Domain)
	}
	if len(m.Tags) != 0 {
		t.Errorf("Tags: expected empty slice, got %v", m.Tags)
	}
}

func TestReadManifest_MissingFile(t *testing.T) {
	_, err := ReadManifest("/nonexistent/path/devtrack.yaml")
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func TestReadManifest_InvalidYAML(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "devtrack.yaml")
	writeFile(t, path, `
name: [bad yaml
  - unclosed bracket
workflow: :::
`)

	_, err := ReadManifest(path)
	if err == nil {
		t.Fatal("expected error for invalid YAML, got nil")
	}
}

func TestReadManifest_InvalidWorkflow(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "devtrack.yaml")
	writeFile(t, path, "name: my-project\nworkflow: invalid\n")

	_, err := ReadManifest(path)
	if err == nil {
		t.Fatal("expected error for invalid workflow, got nil")
	}
}

func TestReadManifest_MissingWorkflow(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "devtrack.yaml")
	writeFile(t, path, "name: my-project\n")

	m, err := ReadManifest(path)
	if err != nil {
		t.Fatalf("expected no error for missing workflow (defaults to sdlc), got: %v", err)
	}
	if m.Workflow != "sdlc" {
		t.Errorf("Workflow: got %q, want %q", m.Workflow, "sdlc")
	}
}

func TestReadManifest_EmptyFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "devtrack.yaml")
	writeFile(t, path, "")

	_, err := ReadManifest(path)
	if err == nil {
		t.Fatal("expected error for empty file, got nil")
	}
}

// ---------------------------------------------------------------------------
// FindManifest tests
// ---------------------------------------------------------------------------

func TestFindManifest_InCurrentDirectory(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "devtrack.yaml"), "name: proj\nworkflow: sdlc\n")

	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	t.Cleanup(func() { os.Chdir(origDir) }) //nolint:errcheck

	if err := os.Chdir(dir); err != nil {
		t.Fatalf("Chdir: %v", err)
	}

	found, err := FindManifest()
	if err != nil {
		t.Fatalf("FindManifest returned unexpected error: %v", err)
	}
	// Evaluate symlinks on both sides so paths agree on systems (e.g. macOS)
	// where t.TempDir() returns a symlinked path but os.Getwd() resolves it.
	want := filepath.Join(dir, "devtrack.yaml")
	wantReal, _ := filepath.EvalSymlinks(want)
	foundReal, _ := filepath.EvalSymlinks(found)
	if foundReal != wantReal {
		t.Errorf("got %q, want %q", found, want)
	}
}

func TestFindManifest_InParentDirectory(t *testing.T) {
	parent := t.TempDir()
	child := filepath.Join(parent, "child")
	if err := os.Mkdir(child, 0o755); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	writeFile(t, filepath.Join(parent, "devtrack.yaml"), "name: proj\nworkflow: sdlc\n")

	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	t.Cleanup(func() { os.Chdir(origDir) }) //nolint:errcheck

	if err := os.Chdir(child); err != nil {
		t.Fatalf("Chdir: %v", err)
	}

	found, err := FindManifest()
	if err != nil {
		t.Fatalf("FindManifest returned unexpected error: %v", err)
	}
	// Evaluate symlinks on both sides so paths agree on systems (e.g. macOS)
	// where t.TempDir() returns a symlinked path but os.Getwd() resolves it.
	want := filepath.Join(parent, "devtrack.yaml")
	wantReal, _ := filepath.EvalSymlinks(want)
	foundReal, _ := filepath.EvalSymlinks(found)
	if foundReal != wantReal {
		t.Errorf("got %q, want %q", found, want)
	}
}

func TestFindManifest_InGrandparentDirectory(t *testing.T) {
	grandparent := t.TempDir()
	child := filepath.Join(grandparent, "child")
	grandchild := filepath.Join(child, "grandchild")
	if err := os.MkdirAll(grandchild, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	writeFile(t, filepath.Join(grandparent, "devtrack.yaml"), "name: proj\nworkflow: sdlc\n")

	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	t.Cleanup(func() { os.Chdir(origDir) }) //nolint:errcheck

	if err := os.Chdir(grandchild); err != nil {
		t.Fatalf("Chdir: %v", err)
	}

	found, err := FindManifest()
	if err != nil {
		t.Fatalf("FindManifest returned unexpected error: %v", err)
	}
	// Evaluate symlinks on both sides so paths agree on systems (e.g. macOS)
	// where t.TempDir() returns a symlinked path but os.Getwd() resolves it.
	want := filepath.Join(grandparent, "devtrack.yaml")
	wantReal, _ := filepath.EvalSymlinks(want)
	foundReal, _ := filepath.EvalSymlinks(found)
	if foundReal != wantReal {
		t.Errorf("got %q, want %q", found, want)
	}
}

func TestFindManifest_NotFound(t *testing.T) {
	// Use a temp dir with no devtrack.yaml anywhere in its ancestry.
	// We change cwd to a known-clean temp dir and run FindManifest from there.
	// Because TempDir paths on most OSes are shallow, we build a deep tree
	// inside TempDir that has no devtrack.yaml.
	base := t.TempDir()
	deep := filepath.Join(base, "a", "b", "c")
	if err := os.MkdirAll(deep, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}

	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	t.Cleanup(func() { os.Chdir(origDir) }) //nolint:errcheck

	if err := os.Chdir(deep); err != nil {
		t.Fatalf("Chdir: %v", err)
	}

	_, err = FindManifest()
	if err == nil {
		t.Fatal("expected error when no devtrack.yaml exists in tree, got nil")
	}
}

// ---------------------------------------------------------------------------
// ResolveProjectID tests
// ---------------------------------------------------------------------------

// mockLister is a controllable implementation of ProjectLister for tests.
type mockLister struct {
	projects []ProjectSummary
	err      error
}

func (m *mockLister) ListProjects() ([]ProjectSummary, error) {
	return m.projects, m.err
}

func TestResolveProjectID_MatchByName(t *testing.T) {
	lister := &mockLister{
		projects: []ProjectSummary{
			{ID: "uuid-1", Name: "other-project", RepoURL: "https://github.com/example/other"},
			{ID: "uuid-2", Name: "my-project", RepoURL: "https://github.com/example/my-project"},
		},
	}
	manifest := &Manifest{Name: "my-project", Workflow: "sdlc"}

	id, err := ResolveProjectID(lister, manifest)
	if err != nil {
		t.Fatalf("ResolveProjectID returned unexpected error: %v", err)
	}
	if id != "uuid-2" {
		t.Errorf("got %q, want %q", id, "uuid-2")
	}
}

func TestResolveProjectID_MatchByRepoURL(t *testing.T) {
	lister := &mockLister{
		projects: []ProjectSummary{
			{ID: "uuid-1", Name: "unrelated", RepoURL: "https://github.com/example/my-project"},
		},
	}
	manifest := &Manifest{
		Name:     "different-local-name",
		Workflow: "sdlc",
		RepoURL:  "https://github.com/example/my-project",
	}

	id, err := ResolveProjectID(lister, manifest)
	if err != nil {
		t.Fatalf("ResolveProjectID returned unexpected error: %v", err)
	}
	if id != "uuid-1" {
		t.Errorf("got %q, want %q", id, "uuid-1")
	}
}

func TestResolveProjectID_NoMatch(t *testing.T) {
	lister := &mockLister{
		projects: []ProjectSummary{
			{ID: "uuid-1", Name: "unrelated", RepoURL: "https://github.com/example/unrelated"},
		},
	}
	manifest := &Manifest{
		Name:     "my-project",
		Workflow: "sdlc",
		RepoURL:  "https://github.com/example/my-project",
	}

	_, err := ResolveProjectID(lister, manifest)
	if err == nil {
		t.Fatal("expected error when no project matches, got nil")
	}
}

func TestResolveProjectID_APIError(t *testing.T) {
	lister := &mockLister{
		err: errors.New("connection refused"),
	}
	manifest := &Manifest{Name: "my-project", Workflow: "sdlc"}

	_, err := ResolveProjectID(lister, manifest)
	if err == nil {
		t.Fatal("expected error when API call fails, got nil")
	}
}

// ---------------------------------------------------------------------------
// Bug fix tests (from Amy's probing)
// ---------------------------------------------------------------------------

func TestFindManifest_IgnoresDirectory(t *testing.T) {
	dir := t.TempDir()
	// Create a directory named devtrack.yaml (not a file)
	if err := os.Mkdir(filepath.Join(dir, "devtrack.yaml"), 0o755); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}

	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	t.Cleanup(func() { os.Chdir(origDir) }) //nolint:errcheck

	if err := os.Chdir(dir); err != nil {
		t.Fatalf("Chdir: %v", err)
	}

	_, err = FindManifest()
	if err == nil {
		t.Fatal("expected error when devtrack.yaml is a directory, got nil")
	}
}

func TestReadManifest_WhitespaceOnlyName(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "devtrack.yaml")
	writeFile(t, path, "name: \"   \"\nworkflow: sdlc\n")

	_, err := ReadManifest(path)
	if err == nil {
		t.Fatal("expected error for whitespace-only name, got nil")
	}
}

func TestResolveProjectID_MatchByRepoURLWithGitSuffix(t *testing.T) {
	lister := &mockLister{
		projects: []ProjectSummary{
			{ID: "uuid-1", Name: "unrelated", RepoURL: "https://github.com/example/my-project.git"},
		},
	}
	manifest := &Manifest{
		Name:     "different-name",
		Workflow: "sdlc",
		RepoURL:  "https://github.com/example/my-project",
	}

	id, err := ResolveProjectID(lister, manifest)
	if err != nil {
		t.Fatalf("ResolveProjectID returned unexpected error: %v", err)
	}
	if id != "uuid-1" {
		t.Errorf("got %q, want %q", id, "uuid-1")
	}
}

func TestResolveProjectID_MatchByRepoURLWithTrailingSlash(t *testing.T) {
	lister := &mockLister{
		projects: []ProjectSummary{
			{ID: "uuid-1", Name: "unrelated", RepoURL: "https://github.com/example/my-project/"},
		},
	}
	manifest := &Manifest{
		Name:     "different-name",
		Workflow: "sdlc",
		RepoURL:  "https://github.com/example/my-project",
	}

	id, err := ResolveProjectID(lister, manifest)
	if err != nil {
		t.Fatalf("ResolveProjectID returned unexpected error: %v", err)
	}
	if id != "uuid-1" {
		t.Errorf("got %q, want %q", id, "uuid-1")
	}
}

// ---------------------------------------------------------------------------
// FindProjectIDByName tests
// ---------------------------------------------------------------------------

func TestFindProjectIDByName_Found(t *testing.T) {
	projects := []ProjectSummary{
		{ID: "aaa", Name: "alpha"},
		{ID: "bbb", Name: "beta"},
		{ID: "ccc", Name: "gamma"},
	}

	got := FindProjectIDByName(projects, "beta")
	if got != "bbb" {
		t.Errorf("FindProjectIDByName(%q) = %q, want %q", "beta", got, "bbb")
	}
}

func TestFindProjectIDByName_FirstMatch(t *testing.T) {
	// When duplicates exist the first match must be returned.
	projects := []ProjectSummary{
		{ID: "first", Name: "duplicate"},
		{ID: "second", Name: "duplicate"},
	}

	got := FindProjectIDByName(projects, "duplicate")
	if got != "first" {
		t.Errorf("FindProjectIDByName with duplicates = %q, want %q", got, "first")
	}
}

func TestFindProjectIDByName_NotFound(t *testing.T) {
	projects := []ProjectSummary{
		{ID: "aaa", Name: "alpha"},
	}

	got := FindProjectIDByName(projects, "missing")
	if got != "" {
		t.Errorf("FindProjectIDByName for missing name = %q, want empty string", got)
	}
}

func TestFindProjectIDByName_EmptySlice(t *testing.T) {
	got := FindProjectIDByName([]ProjectSummary{}, "anything")
	if got != "" {
		t.Errorf("FindProjectIDByName on empty slice = %q, want empty string", got)
	}
}

func TestFindProjectIDByName_CaseSensitive(t *testing.T) {
	// Name matching must be exact (case-sensitive).
	projects := []ProjectSummary{
		{ID: "aaa", Name: "Alpha"},
	}

	got := FindProjectIDByName(projects, "alpha")
	if got != "" {
		t.Errorf("FindProjectIDByName case mismatch = %q, want empty string", got)
	}
}

// ---------------------------------------------------------------------------
// WI-041: content_path and draft_path fields
// ---------------------------------------------------------------------------

func TestReadManifest_ContentPathAndDraftPath(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "devtrack.yaml")
	writeFile(t, path, `
name: my-project
workflow: sdlc
content_path: content/posts
draft_path: content/drafts
`)

	m, err := ReadManifest(path)
	if err != nil {
		t.Fatalf("ReadManifest returned unexpected error: %v", err)
	}
	if m.ContentPath != "content/posts" {
		t.Errorf("ContentPath: got %q, want %q", m.ContentPath, "content/posts")
	}
	if m.DraftPath != "content/drafts" {
		t.Errorf("DraftPath: got %q, want %q", m.DraftPath, "content/drafts")
	}
}

func TestReadManifest_ContentPathAndDraftPathAbsent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "devtrack.yaml")
	writeFile(t, path, "name: minimal-project\n")

	m, err := ReadManifest(path)
	if err != nil {
		t.Fatalf("ReadManifest returned unexpected error when content_path/draft_path absent: %v", err)
	}
	if m.ContentPath != "" {
		t.Errorf("ContentPath: expected empty when absent, got %q", m.ContentPath)
	}
	if m.DraftPath != "" {
		t.Errorf("DraftPath: expected empty when absent, got %q", m.DraftPath)
	}
}

// ---------------------------------------------------------------------------
// WI-579: FindManifest resolves devtrack.yaml; project.yaml is not read
//
// The devtrack.yaml positive path (current dir / parent / grandparent) is
// covered by the TestFindManifest_* cases above, whose fixtures now write
// devtrack.yaml. This case pins the negative half of the hard cutover: a repo
// that has only the legacy project.yaml must not resolve.
// ---------------------------------------------------------------------------

func TestFindManifest_IgnoresLegacyProjectYAML(t *testing.T) {
	dir := t.TempDir()
	// Only the legacy manifest exists — there is no devtrack.yaml.
	writeFile(t, filepath.Join(dir, "project.yaml"), "name: legacy\nworkflow: sdlc\n")

	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	t.Cleanup(func() { os.Chdir(origDir) }) //nolint:errcheck

	if err := os.Chdir(dir); err != nil {
		t.Fatalf("Chdir: %v", err)
	}

	if _, err := FindManifest(); err == nil {
		t.Fatal("expected FindManifest to ignore project.yaml and return an error, got nil")
	}
}

// ---------------------------------------------------------------------------
// WI-579: ResolveIdentity — devtrack.yaml -> git remote -> folder-name chain
//
// Contract (defined here, implemented in manifest.go):
//
//	type Identity struct { Name string; RepoURL string }
//	func ResolveIdentity(dir string, getGitURL func() (string, error)) (Identity, error)
//
// Resolution order for the repo rooted at dir:
//  1. dir/devtrack.yaml if present -> {Name, RepoURL} from the manifest
//  2. else getGitURL() when it succeeds and is non-empty -> {derived name,
//     normalized URL} (trailing slash and .git stripped)
//  3. else -> {lowercased folder name, ""}; never returns an error in this case
//
// getGitURL is injected so tests need not spawn a real `git`.
// ---------------------------------------------------------------------------

// failGitURL simulates a repo with no 'origin' remote.
func failGitURL() (string, error) {
	return "", errors.New("no remote origin")
}

func TestResolveIdentity_FromDevtrackYAML(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "devtrack.yaml"),
		"name: manifest-name\nworkflow: sdlc\nrepo_url: https://github.com/example/manifest-repo\n")
	// A legacy project.yaml with a different identity must be ignored entirely.
	writeFile(t, filepath.Join(dir, "project.yaml"),
		"name: legacy-name\nworkflow: sdlc\nrepo_url: https://github.com/example/legacy\n")

	// A distinct git URL: if the manifest did not short-circuit, the assertions
	// below would surface the git-derived identity instead.
	gitURL := func() (string, error) { return "https://github.com/example/git-derived", nil }

	id, err := ResolveIdentity(dir, gitURL)
	if err != nil {
		t.Fatalf("ResolveIdentity returned unexpected error: %v", err)
	}
	if id.Name != "manifest-name" {
		t.Errorf("Name: got %q, want %q", id.Name, "manifest-name")
	}
	if id.RepoURL != "https://github.com/example/manifest-repo" {
		t.Errorf("RepoURL: got %q, want %q", id.RepoURL, "https://github.com/example/manifest-repo")
	}
}

func TestResolveIdentity_FromGitRemote(t *testing.T) {
	cases := []struct {
		name     string
		remote   string
		wantURL  string
		wantName string
	}{
		{"strips .git suffix", "https://github.com/example/my-project.git", "https://github.com/example/my-project", "my-project"},
		{"strips trailing slash", "https://github.com/example/my-project/", "https://github.com/example/my-project", "my-project"},
		{"plain url", "https://github.com/example/my-project", "https://github.com/example/my-project", "my-project"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir() // no manifest present
			gitURL := func() (string, error) { return tc.remote, nil }

			id, err := ResolveIdentity(dir, gitURL)
			if err != nil {
				t.Fatalf("ResolveIdentity returned unexpected error: %v", err)
			}
			if id.RepoURL != tc.wantURL {
				t.Errorf("RepoURL: got %q, want %q", id.RepoURL, tc.wantURL)
			}
			if id.Name != tc.wantName {
				t.Errorf("Name: got %q, want %q", id.Name, tc.wantName)
			}
		})
	}
}

func TestResolveIdentity_FallsBackToFolderName(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "My-Local-Repo")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	// No manifest and no git remote: local-only repo.
	id, err := ResolveIdentity(dir, failGitURL)
	if err != nil {
		t.Fatalf("ResolveIdentity must not error for a local-only repo, got: %v", err)
	}
	if id.Name != "my-local-repo" {
		t.Errorf("Name: got %q, want %q (folder name lowercased)", id.Name, "my-local-repo")
	}
	if id.RepoURL != "" {
		t.Errorf("RepoURL: got %q, want empty string for a local-only repo", id.RepoURL)
	}
}

func TestResolveIdentity_IgnoresLegacyProjectYAML(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "Repo-Folder")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	// Only a legacy project.yaml exists and there is no git remote. project.yaml
	// must be ignored, so identity falls through to the folder name rather than
	// resolving the name declared inside project.yaml.
	writeFile(t, filepath.Join(dir, "project.yaml"), "name: legacy-name\nworkflow: sdlc\n")

	id, err := ResolveIdentity(dir, failGitURL)
	if err != nil {
		t.Fatalf("ResolveIdentity returned unexpected error: %v", err)
	}
	if id.Name == "legacy-name" {
		t.Fatal("project.yaml was read — expected it to be ignored entirely")
	}
	if id.Name != "repo-folder" {
		t.Errorf("Name: got %q, want %q (folder fallback; project.yaml ignored)", id.Name, "repo-folder")
	}
}

// ---------------------------------------------------------------------------
// RetroLearning #15: a malformed devtrack.yaml must not zero the identity.
//
// ReadManifest returns a non-nil error only when dir/devtrack.yaml exists but is
// malformed (bad YAML, empty name, invalid fields). Previously ResolveIdentity
// propagated that error and returned the zero Identity, which upstream dropped
// every event for the repo (server 422, swallowed by the hook's `|| true`). The
// resolution chain must instead degrade gracefully: a corrupt manifest falls
// through to the git remote, then the folder name — exactly the file the silent
// bootstrap invites users to hand-edit.
// ---------------------------------------------------------------------------

// corruptManifest is malformed YAML that ReadManifest rejects (see
// TestReadManifest_InvalidYAML, which pins this same shape as an error).
const corruptManifest = "name: [bad yaml\n  - unclosed bracket\nworkflow: :::\n"

func TestResolveIdentity_CorruptManifestFallsThroughToGit(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "Widgets-Repo")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	writeFile(t, filepath.Join(dir, "devtrack.yaml"), corruptManifest)

	gitURL := func() (string, error) { return "https://github.com/example/my-project.git", nil }

	id, err := ResolveIdentity(dir, gitURL)
	if err != nil {
		t.Fatalf("ResolveIdentity must not surface an error for a corrupt manifest, got: %v", err)
	}
	if id.RepoURL != "https://github.com/example/my-project" {
		t.Errorf("RepoURL: got %q, want the git-derived URL (corrupt manifest must fall through, not zero the identity)", id.RepoURL)
	}
	if id.Name != "my-project" {
		t.Errorf("Name: got %q, want %q (git-derived; corrupt manifest must fall through)", id.Name, "my-project")
	}
}

func TestResolveIdentity_CorruptManifestFallsThroughToFolderName(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "Local-Only-Repo")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	writeFile(t, filepath.Join(dir, "devtrack.yaml"), corruptManifest)

	// Corrupt manifest and no git remote: identity must still resolve to the
	// folder name rather than the zero value.
	id, err := ResolveIdentity(dir, failGitURL)
	if err != nil {
		t.Fatalf("ResolveIdentity must not surface an error for a corrupt manifest, got: %v", err)
	}
	if id.Name != "local-only-repo" {
		t.Errorf("Name: got %q, want %q (folder fallback; corrupt manifest + no git remote)", id.Name, "local-only-repo")
	}
	if id.RepoURL != "" {
		t.Errorf("RepoURL: got %q, want empty string (no git remote)", id.RepoURL)
	}
}

// A hand-edited manifest that blanks the required name is malformed too; it must
// degrade the same way rather than dropping into the zero identity.
func TestResolveIdentity_EmptyNameManifestFallsThroughToGit(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "Repo-Folder")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	writeFile(t, filepath.Join(dir, "devtrack.yaml"), "name: \"\"\nworkflow: sdlc\n")

	gitURL := func() (string, error) { return "https://github.com/example/my-project", nil }

	id, err := ResolveIdentity(dir, gitURL)
	if err != nil {
		t.Fatalf("ResolveIdentity must not surface an error for an empty-name manifest, got: %v", err)
	}
	if id.Name != "my-project" || id.RepoURL != "https://github.com/example/my-project" {
		t.Errorf("got %+v, want git-derived identity for my-project (empty-name manifest must fall through)", id)
	}
}

// ---------------------------------------------------------------------------
// issue #16 / ADR 0001: BootstrapManifest — the write-once devtrack.yaml
// writer backing the explicit `devtrack init` command. Contract:
//
//	func BootstrapManifest(dir string, identity Identity) error
//
// Writes dir/devtrack.yaml (name + repo_url) when absent; never overwrites an
// existing manifest; and returns any write error for the caller to surface.
// There is no env-var opt-out — since BootstrapManifest is only ever invoked
// by the explicit `init` command now (never from the read-only event path),
// there is no silent write to opt out of.
// ---------------------------------------------------------------------------

// AC1: a manifest-less repo gets a devtrack.yaml with the derived name + repo URL.
func TestBootstrapManifest_WritesNameAndRepoURL(t *testing.T) {
	dir := t.TempDir()

	if err := BootstrapManifest(dir, Identity{Name: "my-proj", RepoURL: "https://github.com/acme/my-proj"}); err != nil {
		t.Fatalf("BootstrapManifest returned unexpected error: %v", err)
	}

	m, err := ReadManifest(filepath.Join(dir, ManifestFilename))
	if err != nil {
		t.Fatalf("written manifest is not readable: %v", err)
	}
	if m.Name != "my-proj" {
		t.Errorf("Name: got %q, want %q", m.Name, "my-proj")
	}
	if m.RepoURL != "https://github.com/acme/my-proj" {
		t.Errorf("RepoURL: got %q, want %q", m.RepoURL, "https://github.com/acme/my-proj")
	}
}

// AC2: write-once — an existing manifest is never overwritten.
func TestBootstrapManifest_WriteOncePreservesExisting(t *testing.T) {
	dir := t.TempDir()
	existing := "name: original-name\nrepo_url: https://github.com/orig/repo\n# hand-edited, keep me\n"
	if err := os.WriteFile(filepath.Join(dir, ManifestFilename), []byte(existing), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	if err := BootstrapManifest(dir, Identity{Name: "different", RepoURL: "https://github.com/diff/repo"}); err != nil {
		t.Fatalf("BootstrapManifest returned unexpected error: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(dir, ManifestFilename))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(got) != existing {
		t.Errorf("write-once violated — existing manifest was modified:\n%s", string(got))
	}
}

// AC4: a failed write returns an error (for the caller to surface) without
// panicking, and leaves no partial file behind.
func TestBootstrapManifest_WriteFailureReturnsErrorGracefully(t *testing.T) {
	// Target a directory that does not exist so the write cannot succeed.
	missingDir := filepath.Join(t.TempDir(), "does-not-exist")

	err := BootstrapManifest(missingDir, Identity{Name: "x", RepoURL: "https://github.com/x/y"})
	if err == nil {
		t.Error("expected an error when the target directory is unwritable, got nil")
	}
	if _, statErr := os.Stat(filepath.Join(missingDir, ManifestFilename)); statErr == nil {
		t.Error("expected no manifest file to be left behind when the write fails")
	}
}

// AC5: the written manifest is valid input to the resolver — a subsequent
// resolve reads it instead of re-deriving from the folder name.
func TestBootstrapManifest_OutputResolvesBackToIdentity(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "Some-Repo") // folder fallback would be "some-repo"
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	id := Identity{Name: "canonical-name", RepoURL: "https://github.com/acme/canonical"}
	if err := BootstrapManifest(dir, id); err != nil {
		t.Fatalf("BootstrapManifest: %v", err)
	}

	got, err := ResolveIdentity(dir, failGitURL)
	if err != nil {
		t.Fatalf("ResolveIdentity: %v", err)
	}
	if got.Name != "canonical-name" {
		t.Errorf("Name: got %q, want %q (resolver did not read the written manifest — folder fallback would be some-repo)", got.Name, "canonical-name")
	}
	if got.RepoURL != "https://github.com/acme/canonical" {
		t.Errorf("RepoURL: got %q, want %q", got.RepoURL, "https://github.com/acme/canonical")
	}
}
