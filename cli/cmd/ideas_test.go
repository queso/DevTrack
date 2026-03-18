package cmd

import (
	"bytes"
	"encoding/json"
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

type fakeIdeasAPI struct {
	// ListProjects behaviour (for manifest resolution)
	listProjects    []internal.ProjectSummary
	listProjectsErr error

	// ListIdeas behaviour
	listIdeas    []IdeaSummary
	listIdeasErr error

	// CreateIdea behaviour
	createIdeaID  string
	createIdeaErr error

	// Recorded create call
	createCalled bool
	createBody   map[string]interface{}
}

func (f *fakeIdeasAPI) ListProjects() ([]internal.ProjectSummary, error) {
	return f.listProjects, f.listProjectsErr
}

func (f *fakeIdeasAPI) ListIdeas(projectID string) ([]IdeaSummary, error) {
	return f.listIdeas, f.listIdeasErr
}

func (f *fakeIdeasAPI) CreateIdea(projectID string, body map[string]interface{}) ([]byte, error) {
	f.createCalled = true
	f.createBody = body
	if f.createIdeaErr != nil {
		return nil, f.createIdeaErr
	}
	return json.Marshal(map[string]interface{}{"id": f.createIdeaID})
}

// ---------------------------------------------------------------------------
// Manifest helpers (reuse writeManifest from register_test.go; defined there)
// ---------------------------------------------------------------------------

// validIdeasManifestContent is a minimal manifest with a matching project below.
const validIdeasManifestContent = `
name: content-project
workflow: content
repo_url: https://github.com/example/content-project
`

// projectForIdeas is the matching ProjectSummary for validIdeasManifestContent.
var projectForIdeas = internal.ProjectSummary{
	ID:      "proj-uuid-ideas",
	Name:    "content-project",
	RepoURL: "https://github.com/example/content-project",
}

// ---------------------------------------------------------------------------
// Tests: runIdeasList (devtrack ideas / devtrack ideas list)
// ---------------------------------------------------------------------------

// TestIdeasList_ShowsFormattedTable verifies that when ideas exist the output
// contains each idea's title in a readable tabular format.
func TestIdeasList_ShowsFormattedTable(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validIdeasManifestContent)

	api := &fakeIdeasAPI{
		listProjects: []internal.ProjectSummary{projectForIdeas},
		listIdeas: []IdeaSummary{
			{ID: "idea-1", Title: "Write a Go tutorial", Tags: []string{"blog"}, Summary: "Intro to Go"},
			{ID: "idea-2", Title: "AI for content teams", Tags: []string{"ai", "blog"}, Summary: ""},
		},
	}

	var out bytes.Buffer
	err := runIdeasList(manifestPath, api, false, &out)
	if err != nil {
		t.Fatalf("runIdeasList returned unexpected error: %v", err)
	}

	got := out.String()
	if !strings.Contains(got, "Write a Go tutorial") {
		t.Errorf("output %q missing idea title %q", got, "Write a Go tutorial")
	}
	if !strings.Contains(got, "AI for content teams") {
		t.Errorf("output %q missing idea title %q", got, "AI for content teams")
	}
}

// TestIdeasList_EmptyShowsNoIdeasMessage verifies that when there are no ideas
// the command prints a friendly "no ideas" message instead of an empty table.
func TestIdeasList_EmptyShowsNoIdeasMessage(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validIdeasManifestContent)

	api := &fakeIdeasAPI{
		listProjects: []internal.ProjectSummary{projectForIdeas},
		listIdeas:    []IdeaSummary{},
	}

	var out bytes.Buffer
	err := runIdeasList(manifestPath, api, false, &out)
	if err != nil {
		t.Fatalf("runIdeasList returned unexpected error: %v", err)
	}

	got := strings.ToLower(out.String())
	if !strings.Contains(got, "no ideas") && !strings.Contains(got, "0 ideas") {
		t.Errorf("expected a 'no ideas' message, got: %q", got)
	}
}

// TestIdeasList_ProjectNotRegistered verifies that a clear error is returned
// when the manifest's project cannot be found in the API (not registered).
func TestIdeasList_ProjectNotRegistered(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validIdeasManifestContent)

	api := &fakeIdeasAPI{
		listProjects: []internal.ProjectSummary{}, // project not registered
	}

	var out bytes.Buffer
	err := runIdeasList(manifestPath, api, false, &out)
	if err == nil {
		t.Fatal("expected error when project is not registered, got nil")
	}
}

// ---------------------------------------------------------------------------
// Tests: runIdeasAdd (devtrack ideas add "title")
// ---------------------------------------------------------------------------

// TestIdeasAdd_CreatesIdeaAndShowsConfirmation verifies that a new idea is
// created via the API and a confirmation message (including its ID) is printed.
func TestIdeasAdd_CreatesIdeaAndShowsConfirmation(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validIdeasManifestContent)

	api := &fakeIdeasAPI{
		listProjects: []internal.ProjectSummary{projectForIdeas},
		createIdeaID: "new-idea-uuid",
	}

	var out bytes.Buffer
	err := runIdeasAdd(manifestPath, "My brilliant idea", nil, "", api, false, &out)
	if err != nil {
		t.Fatalf("runIdeasAdd returned unexpected error: %v", err)
	}

	if !api.createCalled {
		t.Error("expected CreateIdea to be called, but it was not")
	}

	got := out.String()
	if !strings.Contains(got, "new-idea-uuid") {
		t.Errorf("output %q does not contain new idea ID %q", got, "new-idea-uuid")
	}
}

// TestIdeasAdd_WithTagsAndSummary verifies that tags and summary are forwarded
// to the API call body so they are stored on the created idea.
func TestIdeasAdd_WithTagsAndSummary(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validIdeasManifestContent)

	api := &fakeIdeasAPI{
		listProjects: []internal.ProjectSummary{projectForIdeas},
		createIdeaID: "tagged-idea-uuid",
	}

	tags := []string{"blog", "ai"}
	summary := "An overview of AI tooling for content creators"

	var out bytes.Buffer
	err := runIdeasAdd(manifestPath, "AI content tooling", tags, summary, api, false, &out)
	if err != nil {
		t.Fatalf("runIdeasAdd returned unexpected error: %v", err)
	}

	if !api.createCalled {
		t.Fatal("expected CreateIdea to be called")
	}

	// Verify tags were passed to the API.
	rawTags, ok := api.createBody["tags"]
	if !ok {
		t.Fatal("expected 'tags' key in create body, not found")
	}
	tagsSlice, ok := rawTags.([]string)
	if !ok {
		t.Fatalf("expected tags to be []string, got %T", rawTags)
	}
	if len(tagsSlice) != 2 || tagsSlice[0] != "blog" || tagsSlice[1] != "ai" {
		t.Errorf("tags in create body: got %v, want [blog ai]", tagsSlice)
	}

	// Verify summary was passed to the API.
	rawSummary, ok := api.createBody["summary"]
	if !ok {
		t.Fatal("expected 'summary' key in create body, not found")
	}
	if rawSummary != summary {
		t.Errorf("summary in create body: got %q, want %q", rawSummary, summary)
	}
}

// ---------------------------------------------------------------------------
// Tests: quiet mode
// ---------------------------------------------------------------------------

// TestIdeasAdd_QuietMode verifies that with quiet=true the output contains only
// the newly created idea ID and nothing else.
func TestIdeasAdd_QuietMode(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validIdeasManifestContent)

	expectedID := "quiet-idea-uuid"
	api := &fakeIdeasAPI{
		listProjects: []internal.ProjectSummary{projectForIdeas},
		createIdeaID: expectedID,
	}

	var out bytes.Buffer
	err := runIdeasAdd(manifestPath, "Quiet idea", nil, "", api, true, &out)
	if err != nil {
		t.Fatalf("runIdeasAdd (quiet) returned unexpected error: %v", err)
	}

	got := strings.TrimSpace(out.String())
	if got != expectedID {
		t.Errorf("quiet mode output: got %q, want %q (ID only)", got, expectedID)
	}
}

// TestIdeasList_QuietMode verifies that quiet list output contains only IDs,
// one per line, with no table headers or decorations.
func TestIdeasList_QuietMode(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validIdeasManifestContent)

	api := &fakeIdeasAPI{
		listProjects: []internal.ProjectSummary{projectForIdeas},
		listIdeas: []IdeaSummary{
			{ID: "idea-quiet-1", Title: "First idea"},
			{ID: "idea-quiet-2", Title: "Second idea"},
		},
	}

	var out bytes.Buffer
	err := runIdeasList(manifestPath, api, true, &out)
	if err != nil {
		t.Fatalf("runIdeasList (quiet) returned unexpected error: %v", err)
	}

	got := strings.TrimSpace(out.String())
	lines := strings.Split(got, "\n")

	// Each line should be just an ID.
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.Contains(line, " ") || strings.Contains(line, "|") {
			t.Errorf("quiet list line %q looks like a table row; expected bare IDs only", line)
		}
	}

	// Both IDs must appear.
	if !strings.Contains(got, "idea-quiet-1") {
		t.Errorf("output %q missing id %q", got, "idea-quiet-1")
	}
	if !strings.Contains(got, "idea-quiet-2") {
		t.Errorf("output %q missing id %q", got, "idea-quiet-2")
	}
}

// ---------------------------------------------------------------------------
// Tests: manifest / project resolution error paths
// ---------------------------------------------------------------------------

// TestIdeasList_MissingManifest verifies that a clear error is returned when
// no project.yaml can be found.
func TestIdeasList_MissingManifest(t *testing.T) {
	api := &fakeIdeasAPI{}
	var out bytes.Buffer

	err := runIdeasList("/nonexistent/path/project.yaml", api, false, &out)
	if err == nil {
		t.Fatal("expected error for missing project.yaml, got nil")
	}
}

// TestIdeasAdd_ProjectNotRegistered verifies that add also fails cleanly when
// the project has not been registered with DevTrack.
func TestIdeasAdd_ProjectNotRegistered(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, validIdeasManifestContent)

	api := &fakeIdeasAPI{
		listProjects: []internal.ProjectSummary{}, // no projects registered
	}

	var out bytes.Buffer
	err := runIdeasAdd(manifestPath, "orphan idea", nil, "", api, false, &out)
	if err == nil {
		t.Fatal("expected error when project is not registered, got nil")
	}

	// The error message should guide the user.
	errMsg := strings.ToLower(err.Error())
	if !strings.Contains(errMsg, "project") && !strings.Contains(errMsg, "register") && !strings.Contains(errMsg, "not found") {
		t.Errorf("error %q should mention project registration, got: %q", err, errMsg)
	}
}

// ---------------------------------------------------------------------------
// Tests: ideas command registration on rootCmd
// ---------------------------------------------------------------------------

// TestIdeasCmd_Registered verifies the "ideas" command is registered on rootCmd.
func TestIdeasCmd_Registered(t *testing.T) {
	found := false
	for _, sub := range rootCmd.Commands() {
		if sub.Name() == "ideas" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected 'ideas' command to be registered on rootCmd, but it was not found")
	}
}

// TestIdeasCmd_HasQuietFlag verifies the --quiet flag is defined.
func TestIdeasCmd_HasQuietFlag(t *testing.T) {
	ideasCmd := findCommand(rootCmd, "ideas")
	if ideasCmd == nil {
		t.Fatal("'ideas' command not found on rootCmd")
	}

	quietFlag := ideasCmd.Flags().Lookup("quiet")
	if quietFlag == nil {
		// quiet may also be on a persistent flags set; check PersistentFlags
		quietFlag = ideasCmd.PersistentFlags().Lookup("quiet")
	}
	if quietFlag == nil {
		t.Error("expected --quiet flag to be defined on 'ideas' command")
	}
}

// TestIdeasAddCmd_HasTagsAndSummaryFlags verifies that the "add" subcommand
// exposes --tags and --summary flags.
func TestIdeasAddCmd_HasTagsAndSummaryFlags(t *testing.T) {
	ideasCmd := findCommand(rootCmd, "ideas")
	if ideasCmd == nil {
		t.Fatal("'ideas' command not found on rootCmd")
	}

	addCmd := findCommand(ideasCmd, "add")
	if addCmd == nil {
		t.Fatal("'add' subcommand not found under 'ideas'")
	}

	tagsFlag := addCmd.Flags().Lookup("tags")
	if tagsFlag == nil {
		t.Error("expected --tags flag to be defined on 'ideas add' command")
	}

	summaryFlag := addCmd.Flags().Lookup("summary")
	if summaryFlag == nil {
		t.Error("expected --summary flag to be defined on 'ideas add' command")
	}
}

// ---------------------------------------------------------------------------
// Helper: writeManifest for ideas tests
// (writeManifest is already defined in register_test.go in the same package;
//  this alternate helper is used when a unique temp dir is created inline.)
// ---------------------------------------------------------------------------

// writeIdeasManifest writes a project.yaml to a new temp directory and returns
// the path. This avoids conflicts with the writeManifest helper that requires
// a caller-supplied dir.
func writeIdeasManifest(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "project.yaml")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("writeIdeasManifest: %v", err)
	}
	return path
}

// ---------------------------------------------------------------------------
// Tests: API error propagation
// ---------------------------------------------------------------------------

// TestIdeasList_APIError verifies that an API error is surfaced as a command
// error rather than silently swallowed.
func TestIdeasList_APIError(t *testing.T) {
	manifestPath := writeIdeasManifest(t, validIdeasManifestContent)

	api := &fakeIdeasAPI{
		listProjects: []internal.ProjectSummary{projectForIdeas},
		listIdeasErr: errors.New("unexpected status 503: service unavailable"),
	}

	var out bytes.Buffer
	err := runIdeasList(manifestPath, api, false, &out)
	if err == nil {
		t.Fatal("expected error when ListIdeas API call fails, got nil")
	}
}

// TestIdeasAdd_APIError verifies that a create API error is surfaced.
func TestIdeasAdd_APIError(t *testing.T) {
	manifestPath := writeIdeasManifest(t, validIdeasManifestContent)

	api := &fakeIdeasAPI{
		listProjects:  []internal.ProjectSummary{projectForIdeas},
		createIdeaErr: errors.New("unexpected status 500: internal server error"),
	}

	var out bytes.Buffer
	err := runIdeasAdd(manifestPath, "Doomed idea", nil, "", api, false, &out)
	if err == nil {
		t.Fatal("expected error when CreateIdea API call fails, got nil")
	}
}
