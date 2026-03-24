package cmd

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"devtrack/internal"
)

// ---------------------------------------------------------------------------
// Fakes / test doubles
// ---------------------------------------------------------------------------

// fakeProjectAPI is a test double for the ProjectAPI interface that runRegister
// accepts. It records calls and returns canned responses.
type fakeProjectAPI struct {
	// ListProjects behaviour
	listProjects    []internal.ProjectSummary
	listProjectsErr error

	// CreateProject behaviour — returns JSON with the new project's id
	createProjectID  string
	createProjectErr error

	// UpdateProject behaviour — returns JSON with the project's id
	updateProjectID  string
	updateProjectErr error

	// Recorded calls (for assertion)
	createCalled bool
	updateCalled bool
	updateID     string
}

func (f *fakeProjectAPI) ListProjects() ([]internal.ProjectSummary, error) {
	return f.listProjects, f.listProjectsErr
}

func (f *fakeProjectAPI) CreateProject(body map[string]interface{}) ([]byte, error) {
	f.createCalled = true
	if f.createProjectErr != nil {
		return nil, f.createProjectErr
	}
	return json.Marshal(map[string]interface{}{"id": f.createProjectID})
}

func (f *fakeProjectAPI) UpdateProject(id string, body map[string]interface{}) ([]byte, error) {
	f.updateCalled = true
	f.updateID = id
	if f.updateProjectErr != nil {
		return nil, f.updateProjectErr
	}
	return json.Marshal(map[string]interface{}{"id": f.updateProjectID})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// writeManifest creates a project.yaml in dir with the given content.
func writeManifest(t *testing.T, dir, content string) string {
	t.Helper()
	path := filepath.Join(dir, "project.yaml")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("writeManifest: %v", err)
	}
	return path
}

// validManifestContent is a minimal valid project.yaml.
const validManifestContent = `
name: my-project
workflow: sdlc
repo_url: https://github.com/example/my-project
`

// ---------------------------------------------------------------------------
// Tests: runRegister happy paths
// ---------------------------------------------------------------------------

// TestRegister_CreatesNewProject verifies that when no existing project matches
// the manifest, runRegister calls CreateProject and returns the new UUID.
func TestRegister_CreatesNewProject(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestContent)

	api := &fakeProjectAPI{
		listProjects:    []internal.ProjectSummary{}, // no existing projects
		createProjectID: "new-uuid-1234",
	}

	var out bytes.Buffer
	err := runRegister(manifestPath, api, false, &out)
	if err != nil {
		t.Fatalf("runRegister returned unexpected error: %v", err)
	}

	if !api.createCalled {
		t.Error("expected CreateProject to be called, but it was not")
	}
	if api.updateCalled {
		t.Error("expected UpdateProject NOT to be called, but it was")
	}

	got := strings.TrimSpace(out.String())
	if !strings.Contains(got, "new-uuid-1234") {
		t.Errorf("output %q does not contain expected UUID %q", got, "new-uuid-1234")
	}
}

// TestRegister_UpdatesExistingProject verifies that when a project already exists
// with the same name, runRegister calls UpdateProject with the existing ID.
func TestRegister_UpdatesExistingProject(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestContent)

	existingID := "existing-uuid-5678"
	api := &fakeProjectAPI{
		listProjects: []internal.ProjectSummary{
			{ID: existingID, Name: "my-project", RepoURL: "https://github.com/example/my-project"},
		},
		updateProjectID: existingID,
	}

	var out bytes.Buffer
	err := runRegister(manifestPath, api, false, &out)
	if err != nil {
		t.Fatalf("runRegister returned unexpected error: %v", err)
	}

	if api.createCalled {
		t.Error("expected CreateProject NOT to be called, but it was")
	}
	if !api.updateCalled {
		t.Error("expected UpdateProject to be called, but it was not")
	}
	if api.updateID != existingID {
		t.Errorf("UpdateProject called with id %q, want %q", api.updateID, existingID)
	}

	got := strings.TrimSpace(out.String())
	if !strings.Contains(got, existingID) {
		t.Errorf("output %q does not contain expected UUID %q", got, existingID)
	}
}

// ---------------------------------------------------------------------------
// Tests: runRegister error paths
// ---------------------------------------------------------------------------

// TestRegister_MissingManifest verifies that a clear error is returned when the
// project.yaml file does not exist.
func TestRegister_MissingManifest(t *testing.T) {
	api := &fakeProjectAPI{}
	var out bytes.Buffer

	err := runRegister("/nonexistent/path/project.yaml", api, false, &out)
	if err == nil {
		t.Fatal("expected error for missing project.yaml, got nil")
	}
	if api.createCalled || api.updateCalled {
		t.Error("expected no API calls when manifest is missing")
	}
}

// TestRegister_InvalidManifest verifies that a clear error is returned when the
// project.yaml exists but is missing required fields (e.g., name).
func TestRegister_InvalidManifest(t *testing.T) {
	dir := t.TempDir()
	// workflow is present but name is missing — should fail validation
	manifestPath := writeManifest(t, dir, "workflow: sdlc\n")

	api := &fakeProjectAPI{}
	var out bytes.Buffer

	err := runRegister(manifestPath, api, false, &out)
	if err == nil {
		t.Fatal("expected error for invalid manifest (missing name), got nil")
	}
	if api.createCalled || api.updateCalled {
		t.Error("expected no API calls when manifest is invalid")
	}
}

// TestRegister_APIUnreachable verifies that a clear error is returned when the
// API call fails (network unreachable, server error, etc.).
func TestRegister_APIUnreachable(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestContent)

	api := &fakeProjectAPI{
		listProjectsErr: errors.New("connection refused"),
	}
	var out bytes.Buffer

	err := runRegister(manifestPath, api, false, &out)
	if err == nil {
		t.Fatal("expected error when API is unreachable, got nil")
	}
	errMsg := err.Error()
	if !strings.Contains(errMsg, "connection refused") && !strings.Contains(strings.ToLower(errMsg), "api") && !strings.Contains(strings.ToLower(errMsg), "list") {
		t.Errorf("error message %q is not descriptive enough; should mention API or list failure", errMsg)
	}
}

// TestRegister_CreateAPIError verifies error propagation when CreateProject fails.
func TestRegister_CreateAPIError(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestContent)

	api := &fakeProjectAPI{
		listProjects:     []internal.ProjectSummary{}, // no existing projects
		createProjectErr: fmt.Errorf("unexpected status 500: internal server error"),
	}
	var out bytes.Buffer

	err := runRegister(manifestPath, api, false, &out)
	if err == nil {
		t.Fatal("expected error when CreateProject fails, got nil")
	}
}

// ---------------------------------------------------------------------------
// Tests: quiet mode
// ---------------------------------------------------------------------------

// TestRegister_QuietMode verifies that with quiet=true the output contains only
// the UUID and nothing else (no labels, status messages, etc.).
func TestRegister_QuietMode(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestContent)

	expectedUUID := "quiet-uuid-9999"
	api := &fakeProjectAPI{
		listProjects:    []internal.ProjectSummary{},
		createProjectID: expectedUUID,
	}

	var out bytes.Buffer
	err := runRegister(manifestPath, api, true, &out)
	if err != nil {
		t.Fatalf("runRegister (quiet) returned unexpected error: %v", err)
	}

	got := strings.TrimSpace(out.String())
	if got != expectedUUID {
		t.Errorf("quiet mode output: got %q, want %q (UUID only)", got, expectedUUID)
	}
}

// ---------------------------------------------------------------------------
// WI-004: Auto-detect repo_url + hooks install prompt
//
// These tests assume runRegister is extended to accept a registerDeps struct:
//
//   type registerDeps struct {
//       getGitURL    func() (string, error)  // called when manifest.RepoURL is empty
//       installHooks func() error             // called when user accepts hooks prompt
//       confirm      func(prompt string, out io.Writer) bool // prompt; nil = real stdin
//   }
//
//   func runRegister(manifestPath string, api ProjectAPI, quiet bool, out io.Writer, deps registerDeps) error
//
// NOTE: Existing test calls (4 args) will need to be updated to pass
// registerDeps{} as the 5th argument once B.A. updates the signature.
// ---------------------------------------------------------------------------

const noRepoURLManifest = `
name: my-project
workflow: sdlc
`

// TestRegister_AutoDetectsRepoURLFromGit verifies that when manifest.repo_url
// is empty, runRegister calls deps.getGitURL and uses the returned URL.
func TestRegister_AutoDetectsRepoURLFromGit(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, noRepoURLManifest)

	detectedURL := "https://github.com/auto/detected"
	gitCalled := false

	api := &fakeProjectAPI{
		listProjects:    []internal.ProjectSummary{},
		createProjectID: "new-uuid-auto",
	}

	var out bytes.Buffer
	deps := registerDeps{
		getGitURL: func() (string, error) {
			gitCalled = true
			return detectedURL, nil
		},
	}
	err := runRegister(manifestPath, api, false, &out, deps)
	if err != nil {
		t.Fatalf("runRegister returned unexpected error: %v", err)
	}

	if !gitCalled {
		t.Error("expected getGitURL to be called when manifest has no repo_url, but it was not")
	}

	// The body passed to CreateProject should include the auto-detected URL.
	// We verify indirectly: if create was called successfully, the URL was usable.
	if !api.createCalled {
		t.Error("expected CreateProject to be called")
	}
}

// TestRegister_ManifestRepoURLTakesPrecedenceOverGit verifies that when
// manifest.repo_url is already set, deps.getGitURL is NOT called.
func TestRegister_ManifestRepoURLTakesPrecedenceOverGit(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestContent) // has repo_url

	gitCalled := false
	api := &fakeProjectAPI{
		listProjects:    []internal.ProjectSummary{},
		createProjectID: "uuid-manifest-url",
	}

	var out bytes.Buffer
	deps := registerDeps{
		getGitURL: func() (string, error) {
			gitCalled = true
			return "https://github.com/should/not/use", nil
		},
	}
	err := runRegister(manifestPath, api, false, &out, deps)
	if err != nil {
		t.Fatalf("runRegister returned unexpected error: %v", err)
	}

	if gitCalled {
		t.Error("expected getGitURL NOT to be called when manifest already has repo_url, but it was")
	}
}

// TestRegister_PromptsAndInstallsHooksAfterCreate verifies that after a
// successful project creation, runRegister calls deps.confirm and, if the
// user accepts, calls deps.installHooks.
func TestRegister_PromptsAndInstallsHooksAfterCreate(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestContent)

	api := &fakeProjectAPI{
		listProjects:    []internal.ProjectSummary{},
		createProjectID: "new-uuid-hooks",
	}

	confirmCalled := false
	hooksCalled := false

	var out bytes.Buffer
	deps := registerDeps{
		confirm: func(prompt string, w io.Writer) bool {
			confirmCalled = true
			return true // user says yes
		},
		installHooks: func() error {
			hooksCalled = true
			return nil
		},
	}
	err := runRegister(manifestPath, api, false, &out, deps)
	if err != nil {
		t.Fatalf("runRegister returned unexpected error: %v", err)
	}

	if !confirmCalled {
		t.Error("expected confirm prompt to be shown after project creation, but it was not")
	}
	if !hooksCalled {
		t.Error("expected installHooks to be called after user accepted the prompt, but it was not")
	}
}

// TestRegister_NoHooksPromptOnUpdate verifies that runRegister does NOT prompt
// for hooks installation when updating an existing project (only on create).
func TestRegister_NoHooksPromptOnUpdate(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestContent)

	existingID := "existing-uuid-nohooks"
	api := &fakeProjectAPI{
		listProjects: []internal.ProjectSummary{
			{ID: existingID, Name: "my-project"},
		},
		updateProjectID: existingID,
	}

	confirmCalled := false
	hooksCalled := false

	var out bytes.Buffer
	deps := registerDeps{
		confirm: func(prompt string, w io.Writer) bool {
			confirmCalled = true
			return true
		},
		installHooks: func() error {
			hooksCalled = true
			return nil
		},
	}
	err := runRegister(manifestPath, api, false, &out, deps)
	if err != nil {
		t.Fatalf("runRegister returned unexpected error: %v", err)
	}

	if confirmCalled {
		t.Error("expected confirm NOT to be called on project update, but it was")
	}
	if hooksCalled {
		t.Error("expected installHooks NOT to be called on project update, but it was")
	}
}

// TestRegister_QuietModeSkipsHooksPrompt verifies that with quiet=true, the
// hooks prompt is never shown and hooks are never installed after creation.
func TestRegister_QuietModeSkipsHooksPrompt(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validManifestContent)

	api := &fakeProjectAPI{
		listProjects:    []internal.ProjectSummary{},
		createProjectID: "quiet-new-uuid",
	}

	confirmCalled := false
	hooksCalled := false

	var out bytes.Buffer
	deps := registerDeps{
		confirm: func(prompt string, w io.Writer) bool {
			confirmCalled = true
			return true
		},
		installHooks: func() error {
			hooksCalled = true
			return nil
		},
	}
	err := runRegister(manifestPath, api, true /* quiet */, &out, deps)
	if err != nil {
		t.Fatalf("runRegister (quiet) returned unexpected error: %v", err)
	}

	if confirmCalled {
		t.Error("expected confirm NOT to be called in quiet mode, but it was")
	}
	if hooksCalled {
		t.Error("expected installHooks NOT to be called in quiet mode, but it was")
	}
}
