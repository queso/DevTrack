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
	path := filepath.Join(dir, "project.yaml")
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
	path := filepath.Join(dir, "project.yaml")
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
	_, err := ReadManifest("/nonexistent/path/project.yaml")
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func TestReadManifest_InvalidYAML(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "project.yaml")
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
	path := filepath.Join(dir, "project.yaml")
	writeFile(t, path, "name: my-project\nworkflow: invalid\n")

	_, err := ReadManifest(path)
	if err == nil {
		t.Fatal("expected error for invalid workflow, got nil")
	}
}

func TestReadManifest_MissingWorkflow(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "project.yaml")
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
	path := filepath.Join(dir, "project.yaml")
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
	writeFile(t, filepath.Join(dir, "project.yaml"), "name: proj\nworkflow: sdlc\n")

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
	want := filepath.Join(dir, "project.yaml")
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
	writeFile(t, filepath.Join(parent, "project.yaml"), "name: proj\nworkflow: sdlc\n")

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
	want := filepath.Join(parent, "project.yaml")
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
	writeFile(t, filepath.Join(grandparent, "project.yaml"), "name: proj\nworkflow: sdlc\n")

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
	want := filepath.Join(grandparent, "project.yaml")
	wantReal, _ := filepath.EvalSymlinks(want)
	foundReal, _ := filepath.EvalSymlinks(found)
	if foundReal != wantReal {
		t.Errorf("got %q, want %q", found, want)
	}
}

func TestFindManifest_NotFound(t *testing.T) {
	// Use a temp dir with no project.yaml anywhere in its ancestry.
	// We change cwd to a known-clean temp dir and run FindManifest from there.
	// Because TempDir paths on most OSes are shallow, we build a deep tree
	// inside TempDir that has no project.yaml.
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
		t.Fatal("expected error when no project.yaml exists in tree, got nil")
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
		Name:    "different-local-name",
		Workflow: "sdlc",
		RepoURL: "https://github.com/example/my-project",
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
		Name:    "my-project",
		Workflow: "sdlc",
		RepoURL: "https://github.com/example/my-project",
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
	// Create a directory named project.yaml (not a file)
	if err := os.Mkdir(filepath.Join(dir, "project.yaml"), 0o755); err != nil {
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
		t.Fatal("expected error when project.yaml is a directory, got nil")
	}
}

func TestReadManifest_WhitespaceOnlyName(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "project.yaml")
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
		Name:    "different-name",
		Workflow: "sdlc",
		RepoURL: "https://github.com/example/my-project",
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
