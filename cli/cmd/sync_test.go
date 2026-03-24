package cmd

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"devtrack/internal"
)

// ---------------------------------------------------------------------------
// Fakes / test doubles
// ---------------------------------------------------------------------------

// fakeSyncAPI is a controllable test double for SyncAPI.
type fakeSyncAPI struct {
	// ListProjects behaviour
	listProjects    []internal.ProjectSummary
	listProjectsErr error

	// SyncPullRequests behaviour
	syncResponseBody []byte
	syncErr          error

	// Recorded calls (for assertion)
	syncCalled    bool
	syncProjectID string
}

func (f *fakeSyncAPI) ListProjects() ([]internal.ProjectSummary, error) {
	return f.listProjects, f.listProjectsErr
}

func (f *fakeSyncAPI) SyncPullRequests(projectID string) ([]byte, error) {
	f.syncCalled = true
	f.syncProjectID = projectID
	return f.syncResponseBody, f.syncErr
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// validSyncManifest is a minimal manifest that resolves to a known project ID.
const validSyncManifest = `
name: my-project
workflow: sdlc
repo_url: https://github.com/example/my-project
`

// knownProjectID is the server-assigned UUID used across sync tests.
const knownProjectID = "proj-uuid-1234"

// syncProject is the pre-registered project that matches validSyncManifest.
var syncProject = internal.ProjectSummary{
	ID:      knownProjectID,
	Name:    "my-project",
	RepoURL: "https://github.com/example/my-project",
}

// ---------------------------------------------------------------------------
// Tests: sync happy path
// ---------------------------------------------------------------------------

// TestSync_SuccessTriggersAPIAndShowsSummary verifies that runSync calls
// SyncPullRequests with the correct project ID and writes a result summary to
// the output writer.
func TestSync_SuccessTriggersAPIAndShowsSummary(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validSyncManifest)

	responseBody := []byte(`{"synced": 3, "created": 2, "updated": 1, "closed": 0}`)
	api := &fakeSyncAPI{
		listProjects:     []internal.ProjectSummary{syncProject},
		syncResponseBody: responseBody,
	}

	var out bytes.Buffer
	err := runSync(manifestPath, api, false, &out)
	if err != nil {
		t.Fatalf("runSync returned unexpected error: %v", err)
	}

	// Must have called SyncPullRequests with the resolved project ID.
	if !api.syncCalled {
		t.Error("expected SyncPullRequests to be called, but it was not")
	}
	if api.syncProjectID != knownProjectID {
		t.Errorf("SyncPullRequests called with project ID %q, want %q", api.syncProjectID, knownProjectID)
	}

	// Output should contain some indication that the sync completed and how
	// many PRs were affected.
	got := out.String()
	if got == "" {
		t.Error("expected non-empty output after successful sync, got empty string")
	}
	// At minimum the output should indicate success or mention pull requests.
	lowerGot := strings.ToLower(got)
	if !strings.Contains(lowerGot, "sync") && !strings.Contains(lowerGot, "pull") && !strings.Contains(lowerGot, "pr") {
		t.Errorf("output %q should mention sync or pull requests", got)
	}
}

// ---------------------------------------------------------------------------
// Tests: project not registered
// ---------------------------------------------------------------------------

// TestSync_ProjectNotRegistered verifies that a clear error is returned when
// the manifest cannot be resolved to a registered project (i.e., the project
// has not been registered with devtrack register yet).
func TestSync_ProjectNotRegistered(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validSyncManifest)

	// Return a list that contains an unrelated project — no match.
	api := &fakeSyncAPI{
		listProjects: []internal.ProjectSummary{
			{ID: "other-uuid", Name: "other-project", RepoURL: "https://github.com/example/other"},
		},
	}

	var out bytes.Buffer
	err := runSync(manifestPath, api, false, &out)
	if err == nil {
		t.Fatal("expected error when project is not registered, got nil")
	}

	// The error must be descriptive — it should mention registration or the
	// project name so the user knows what to do next.
	errMsg := strings.ToLower(err.Error())
	if !strings.Contains(errMsg, "register") && !strings.Contains(errMsg, "not found") && !strings.Contains(errMsg, "my-project") {
		t.Errorf("error %q is not descriptive enough; should mention registration or project name", err.Error())
	}

	// No sync call should have been made.
	if api.syncCalled {
		t.Error("expected SyncPullRequests NOT to be called when project is not registered")
	}
}

// ---------------------------------------------------------------------------
// Tests: API error
// ---------------------------------------------------------------------------

// TestSync_APIError verifies that a clear error is surfaced when the sync API
// call fails (e.g., server error, network timeout).
func TestSync_APIError(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validSyncManifest)

	api := &fakeSyncAPI{
		listProjects: []internal.ProjectSummary{syncProject},
		syncErr:      errors.New("unexpected status 500: internal server error"),
	}

	var out bytes.Buffer
	err := runSync(manifestPath, api, false, &out)
	if err == nil {
		t.Fatal("expected error when sync API call fails, got nil")
	}

	// The propagated error should contain enough context for the user to act.
	errMsg := err.Error()
	if !strings.Contains(errMsg, "500") && !strings.Contains(strings.ToLower(errMsg), "sync") && !strings.Contains(strings.ToLower(errMsg), "server") {
		t.Errorf("error %q should surface the API failure detail", errMsg)
	}
}

// ---------------------------------------------------------------------------
// Tests: quiet mode
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WI-005: Full sync — project update + PRD sync + PR sync
//
// These tests assume runSync is extended to accept an updated SyncAPI that
// adds two new methods:
//
//   type SyncAPI interface {
//       ListProjects()  ([]internal.ProjectSummary, error)  // unchanged
//       SyncPullRequests(projectID string) ([]byte, error)  // unchanged
//       UpdateProject(id string, body map[string]interface{}) ([]byte, error)  // NEW
//       SyncPRDs(projectID string, prds []map[string]interface{}) (int, error) // NEW
//   }
//
// fakeSyncAPIFull implements the extended interface.
// Existing tests using fakeSyncAPI will need the two new methods added when
// B.A. extends the interface (a one-line addition per method is enough).
// ---------------------------------------------------------------------------

// fakeSyncAPIFull is a test double for the extended SyncAPI.
type fakeSyncAPIFull struct {
	// ListProjects / SyncPullRequests (same as fakeSyncAPI)
	listProjects     []internal.ProjectSummary
	listProjectsErr  error
	syncResponseBody []byte
	syncErr          error
	syncCalled       bool
	syncProjectID    string

	// UpdateProject (new)
	updateProjectID  string
	updateProjectErr error
	updateCalled     bool

	// SyncPRDs (new): returns a count of PRDs synced
	syncPRDsCount int
	syncPRDsErr   error
	syncPRDsCalled bool
	lastPRDs       []map[string]interface{}
}

func (f *fakeSyncAPIFull) ListProjects() ([]internal.ProjectSummary, error) {
	return f.listProjects, f.listProjectsErr
}

func (f *fakeSyncAPIFull) SyncPullRequests(projectID string) ([]byte, error) {
	f.syncCalled = true
	f.syncProjectID = projectID
	return f.syncResponseBody, f.syncErr
}

func (f *fakeSyncAPIFull) UpdateProject(id string, body map[string]interface{}) ([]byte, error) {
	f.updateCalled = true
	if f.updateProjectErr != nil {
		return nil, f.updateProjectErr
	}
	return []byte(`{"id":"` + f.updateProjectID + `"}`), nil
}

func (f *fakeSyncAPIFull) SyncPRDs(projectID string, prds []map[string]interface{}) (int, error) {
	f.syncPRDsCalled = true
	f.lastPRDs = prds
	return f.syncPRDsCount, f.syncPRDsErr
}

// validFullSyncManifest includes a prd_path so PRD scanning is triggered.
const validFullSyncManifest = `
name: my-project
workflow: sdlc
repo_url: https://github.com/example/my-project
prd_path: prds/
`

// writePRDFile creates a minimal PRD markdown file in dir/prds/.
func writePRDFile(t *testing.T, prdsDir, filename, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(prdsDir, filename), []byte(content), 0o644); err != nil {
		t.Fatalf("writePRDFile: %v", err)
	}
}

// TestSync_FullSync_UpdatesProjectFromManifest verifies that full sync calls
// UpdateProject on the API with the manifest data, keeping the project in sync.
func TestSync_FullSync_UpdatesProjectFromManifest(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validFullSyncManifest)
	prdsDir := filepath.Join(dir, "prds")
	if err := os.MkdirAll(prdsDir, 0o755); err != nil {
		t.Fatal(err)
	}

	api := &fakeSyncAPIFull{
		listProjects:     []internal.ProjectSummary{syncProject},
		updateProjectID:  knownProjectID,
		syncResponseBody: []byte(`{"synced":0,"created":0,"updated":0,"closed":0}`),
	}

	var out bytes.Buffer
	if err := runSync(manifestPath, api, false, &out); err != nil {
		t.Fatalf("runSync returned unexpected error: %v", err)
	}

	if !api.updateCalled {
		t.Error("expected UpdateProject to be called during full sync, but it was not")
	}
}

// TestSync_FullSync_SyncsPRDsFromDirectory verifies that runSync scans prd_path
// for markdown files and passes them to SyncPRDs.
func TestSync_FullSync_SyncsPRDsFromDirectory(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validFullSyncManifest)
	prdsDir := filepath.Join(dir, "prds")
	if err := os.MkdirAll(prdsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writePRDFile(t, prdsDir, "001-feature.md", "# PRD: Feature One\n\nSummary of feature one.\n")
	writePRDFile(t, prdsDir, "002-feature.md", "# PRD: Feature Two\n\nSummary of feature two.\n")

	api := &fakeSyncAPIFull{
		listProjects:     []internal.ProjectSummary{syncProject},
		updateProjectID:  knownProjectID,
		syncPRDsCount:    2,
		syncResponseBody: []byte(`{"synced":0,"created":0,"updated":0,"closed":0}`),
	}

	var out bytes.Buffer
	if err := runSync(manifestPath, api, false, &out); err != nil {
		t.Fatalf("runSync returned unexpected error: %v", err)
	}

	if !api.syncPRDsCalled {
		t.Error("expected SyncPRDs to be called when prd_path has markdown files, but it was not")
	}
	if len(api.lastPRDs) != 2 {
		t.Errorf("expected SyncPRDs to be called with 2 PRD entries (one per .md file), got %d", len(api.lastPRDs))
	}
}

// TestSync_FullSync_SummaryLineIncludesPRDsAndPRs verifies that the output
// summary mentions both PRDs and PRs synced.
func TestSync_FullSync_SummaryLineIncludesPRDsAndPRs(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validFullSyncManifest)
	prdsDir := filepath.Join(dir, "prds")
	if err := os.MkdirAll(prdsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writePRDFile(t, prdsDir, "001-feature.md", "# PRD: Feature One\n")
	writePRDFile(t, prdsDir, "002-feature.md", "# PRD: Feature Two\n")
	writePRDFile(t, prdsDir, "003-feature.md", "# PRD: Feature Three\n")

	api := &fakeSyncAPIFull{
		listProjects:     []internal.ProjectSummary{syncProject},
		updateProjectID:  knownProjectID,
		syncPRDsCount:    3,
		syncResponseBody: []byte(`{"synced":2,"created":1,"updated":1,"closed":0}`),
	}

	var out bytes.Buffer
	if err := runSync(manifestPath, api, false, &out); err != nil {
		t.Fatalf("runSync returned unexpected error: %v", err)
	}

	got := strings.ToLower(out.String())
	if !strings.Contains(got, "3") || !strings.Contains(got, "prd") {
		t.Errorf("output %q should mention PRD count (3)", out.String())
	}
	if !strings.Contains(got, "pr") {
		t.Errorf("output %q should mention PRs synced", out.String())
	}
}

// TestSync_FullSync_QuietPrintsSingleSummaryLine verifies that --quiet prints
// exactly one summary line (not the full verbose output).
func TestSync_FullSync_QuietPrintsSingleSummaryLine(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validFullSyncManifest)
	prdsDir := filepath.Join(dir, "prds")
	if err := os.MkdirAll(prdsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writePRDFile(t, prdsDir, "001.md", "# PRD: One\n")

	api := &fakeSyncAPIFull{
		listProjects:     []internal.ProjectSummary{syncProject},
		updateProjectID:  knownProjectID,
		syncPRDsCount:    1,
		syncResponseBody: []byte(`{"synced":2,"created":1,"updated":1,"closed":0}`),
	}

	var out bytes.Buffer
	if err := runSync(manifestPath, api, true /* quiet */, &out); err != nil {
		t.Fatalf("runSync (quiet) returned unexpected error: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 1 {
		t.Errorf("quiet mode should print exactly 1 line, got %d: %v", len(lines), lines)
	}
	// The single line should be the summary mentioning sync counts.
	summary := strings.ToLower(lines[0])
	if !strings.Contains(summary, "sync") && !strings.Contains(summary, "prd") && !strings.Contains(summary, "pr") {
		t.Errorf("quiet summary line %q should mention what was synced", lines[0])
	}
}

// ---------------------------------------------------------------------------
// Tests: quiet mode (existing behavior, kept for reference)
// ---------------------------------------------------------------------------

// TestSync_QuietMode verifies that with quiet=true the output is minimal —
// no decorative status messages, progress indicators, or summaries beyond the
// bare essential (e.g., project ID or a single confirmation line).
func TestSync_QuietMode(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validSyncManifest)

	responseBody := []byte(`{"synced": 2, "created": 1, "updated": 1, "closed": 0}`)
	api := &fakeSyncAPI{
		listProjects:     []internal.ProjectSummary{syncProject},
		syncResponseBody: responseBody,
	}

	var quietOut bytes.Buffer
	err := runSync(manifestPath, api, true, &quietOut)
	if err != nil {
		t.Fatalf("runSync (quiet) returned unexpected error: %v", err)
	}

	var verboseOut bytes.Buffer
	api2 := &fakeSyncAPI{
		listProjects:     []internal.ProjectSummary{syncProject},
		syncResponseBody: responseBody,
	}
	if err := runSync(manifestPath, api2, false, &verboseOut); err != nil {
		t.Fatalf("runSync (verbose) returned unexpected error: %v", err)
	}

	// Quiet output must be shorter than verbose output.
	if len(quietOut.String()) >= len(verboseOut.String()) {
		t.Errorf("quiet output (%d bytes) should be shorter than verbose output (%d bytes)",
			len(quietOut.String()), len(verboseOut.String()))
	}

	// Quiet output must not be empty — at minimum it confirms the sync ran.
	if strings.TrimSpace(quietOut.String()) == "" {
		t.Error("quiet mode should still produce minimal confirmation output, got empty string")
	}
}
