package cmd

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"devtrack/internal"
)

// ---------------------------------------------------------------------------
// Fakes / test doubles
// ---------------------------------------------------------------------------

// fakeIdeasAPI is a controllable test double for the IdeasAPI interface.
type fakeIdeasAPI struct {
	// ListProjects — required for ResolveProjectID in non-all mode
	listProjects    []internal.ProjectSummary
	listProjectsErr error

	// ListProjectIdeas — response for GET /api/v1/projects/:id/ideas
	listIdeasBody        []byte
	listIdeasErr         error
	listIdeasCalledWith  string // project ID passed to the call

	// ListAllIdeas — response for GET /api/v1/ideas
	listAllIdeasBody []byte
	listAllIdeasErr  error
	listAllCalled    bool

	// AddIdea — response for POST /api/v1/ideas
	addIdeaBody      []byte
	addIdeaErr       error
	addIdeaCalledWith map[string]interface{}
}

func (f *fakeIdeasAPI) ListProjects() ([]internal.ProjectSummary, error) {
	return f.listProjects, f.listProjectsErr
}

func (f *fakeIdeasAPI) ListProjectIdeas(projectID string) ([]byte, error) {
	f.listIdeasCalledWith = projectID
	return f.listIdeasBody, f.listIdeasErr
}

func (f *fakeIdeasAPI) ListAllIdeas() ([]byte, error) {
	f.listAllCalled = true
	return f.listAllIdeasBody, f.listAllIdeasErr
}

func (f *fakeIdeasAPI) AddIdea(body map[string]interface{}) ([]byte, error) {
	f.addIdeaCalledWith = body
	return f.addIdeaBody, f.addIdeaErr
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ideasProjectManifest = `
name: my-project
workflow: sdlc
repo_url: https://github.com/example/my-project
`

var ideasProject = internal.ProjectSummary{
	ID:      "proj-ideas-uuid",
	Name:    "my-project",
	RepoURL: "https://github.com/example/my-project",
}

// ---------------------------------------------------------------------------
// WI-043 tests
// ---------------------------------------------------------------------------

// TestIdeas_ListForProject verifies that `devtrack ideas` resolves the project
// via devtrack.yaml and calls ListProjectIdeas with the correct project ID.
func TestIdeas_ListForProject(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, ideasProjectManifest)

	responseBody := []byte(`[{"id":"idea-1","title":"Write about Go generics"},{"id":"idea-2","title":"AI tooling roundup"}]`)
	api := &fakeIdeasAPI{
		listProjects:  []internal.ProjectSummary{ideasProject},
		listIdeasBody: responseBody,
	}

	var out bytes.Buffer
	err := runListIdeas(manifestPath, false, api, false, false, &out)
	if err != nil {
		t.Fatalf("runListIdeas returned unexpected error: %v", err)
	}

	if api.listAllCalled {
		t.Error("expected ListAllIdeas NOT to be called, but it was")
	}
	if api.listIdeasCalledWith != ideasProject.ID {
		t.Errorf("ListProjectIdeas called with project ID %q, want %q", api.listIdeasCalledWith, ideasProject.ID)
	}
}

// TestIdeas_ListAllBypassesManifest verifies that `devtrack ideas --all`
// calls ListAllIdeas directly without reading devtrack.yaml.
func TestIdeas_ListAllBypassesManifest(t *testing.T) {
	responseBody := []byte(`[{"id":"idea-1","title":"Cross-project idea"}]`)
	api := &fakeIdeasAPI{
		listAllIdeasBody: responseBody,
	}

	var out bytes.Buffer
	// Pass empty manifestPath — FindManifest must NOT be called when all=true
	err := runListIdeas("", true, api, false, false, &out)
	if err != nil {
		t.Fatalf("runListIdeas --all returned unexpected error: %v", err)
	}

	if !api.listAllCalled {
		t.Error("expected ListAllIdeas to be called with --all, but it was not")
	}
	if api.listIdeasCalledWith != "" {
		t.Errorf("expected ListProjectIdeas NOT to be called with --all, but it was called with %q", api.listIdeasCalledWith)
	}
}

// TestIdeas_AddWithTagsAndSummary verifies that `devtrack ideas add <title>
// --tags blog,ai --summary text` sends all fields to the API.
func TestIdeas_AddWithTagsAndSummary(t *testing.T) {
	responseBody := []byte(`{"id":"new-idea-123","title":"My new idea"}`)
	api := &fakeIdeasAPI{
		addIdeaBody: responseBody,
	}

	var out bytes.Buffer
	err := runAddIdea("My new idea", []string{"blog", "ai"}, "A quick summary", api, false, false, &out)
	if err != nil {
		t.Fatalf("runAddIdea returned unexpected error: %v", err)
	}

	if api.addIdeaCalledWith == nil {
		t.Fatal("expected AddIdea to be called, but it was not")
	}
	if api.addIdeaCalledWith["title"] != "My new idea" {
		t.Errorf("body title = %q, want %q", api.addIdeaCalledWith["title"], "My new idea")
	}
	if api.addIdeaCalledWith["summary"] != "A quick summary" {
		t.Errorf("body summary = %q, want %q", api.addIdeaCalledWith["summary"], "A quick summary")
	}
	// tags should be present and contain both values
	tags, ok := api.addIdeaCalledWith["tags"].([]string)
	if !ok || len(tags) != 2 || tags[0] != "blog" || tags[1] != "ai" {
		t.Errorf("body tags = %v, want [blog ai]", api.addIdeaCalledWith["tags"])
	}
}

// TestIdeas_NoManifestWithoutAll verifies that when no devtrack.yaml is found
// and --all is not set, runListIdeas returns a clear error message.
func TestIdeas_NoManifestWithoutAll(t *testing.T) {
	api := &fakeIdeasAPI{}

	var out bytes.Buffer
	err := runListIdeas("/nonexistent/path/devtrack.yaml", false, api, false, false, &out)
	if err == nil {
		t.Fatal("expected error when devtrack.yaml missing and --all not set, got nil")
	}
	// Error message should guide the user (mention the manifest or --all)
	msg := err.Error()
	if !strings.Contains(strings.ToLower(msg), "devtrack") && !strings.Contains(msg, "--all") {
		t.Errorf("error message %q should reference devtrack.yaml or the --all flag", msg)
	}
}

// TestIdeas_AuthError verifies that a 401 response results in a user-friendly
// error message suggesting the user check their API key.
func TestIdeas_AuthError(t *testing.T) {
	api := &fakeIdeasAPI{
		listProjects:  []internal.ProjectSummary{ideasProject},
		listIdeasErr:  errors.New("unexpected status 401: unauthorized"),
	}

	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, ideasProjectManifest)

	var out bytes.Buffer
	err := runListIdeas(manifestPath, false, api, false, false, &out)
	if err == nil {
		t.Fatal("expected error for 401 response, got nil")
	}

	// Error or output should mention API key
	combined := err.Error() + out.String()
	if !strings.Contains(strings.ToLower(combined), "api key") &&
		!strings.Contains(strings.ToLower(combined), "auth") &&
		!strings.Contains(strings.ToLower(combined), "401") {
		t.Errorf("error %q should mention authentication or API key", err.Error())
	}
}

// TestIdeas_QuietModeOutputsOnlyIDs verifies that --quiet outputs only idea
// IDs, one per line.
func TestIdeas_QuietModeOutputsOnlyIDs(t *testing.T) {
	dir := t.TempDir()
	manifestPath := writeManifest(t, dir, ideasProjectManifest)

	responseBody := []byte(`[{"id":"idea-aaa","title":"First idea"},{"id":"idea-bbb","title":"Second idea"}]`)
	api := &fakeIdeasAPI{
		listProjects:  []internal.ProjectSummary{ideasProject},
		listIdeasBody: responseBody,
	}

	var out bytes.Buffer
	err := runListIdeas(manifestPath, false, api, false, true /* quiet */, &out)
	if err != nil {
		t.Fatalf("runListIdeas (quiet) returned unexpected error: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("quiet mode: got %d lines, want 2; output: %q", len(lines), out.String())
	}
	if lines[0] != "idea-aaa" {
		t.Errorf("quiet mode line[0] = %q, want %q", lines[0], "idea-aaa")
	}
	if lines[1] != "idea-bbb" {
		t.Errorf("quiet mode line[1] = %q, want %q", lines[1], "idea-bbb")
	}
}

// TestIdeasCmd_Registered verifies the ideas command is registered on rootCmd.
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

// TestIdeasCmd_HasAddSubcommand verifies the add subcommand exists.
func TestIdeasCmd_HasAddSubcommand(t *testing.T) {
	ideasCmd := findCommand(rootCmd, "ideas")
	if ideasCmd == nil {
		t.Fatal("'ideas' command not found on rootCmd")
	}

	addCmd := findCommand(ideasCmd, "add")
	if addCmd == nil {
		t.Fatal("expected 'add' subcommand on 'ideas' command, but it was not found")
	}
}

// TestIdeasAdd_TitleRequired verifies that `devtrack ideas add` without a
// title argument returns an error.
func TestIdeasAdd_TitleRequired(t *testing.T) {
	api := &fakeIdeasAPI{}
	var out bytes.Buffer

	err := runAddIdea("", nil, "", api, false, false, &out)
	if err == nil {
		t.Fatal("expected error when title is empty, got nil")
	}
	if api.addIdeaCalledWith != nil {
		t.Error("expected AddIdea NOT to be called when title is empty, but it was")
	}
}

// TestIdeasCmd_HasFlags verifies --all, --json, and --quiet flags are defined.
func TestIdeasCmd_HasFlags(t *testing.T) {
	ideasCmd := findCommand(rootCmd, "ideas")
	if ideasCmd == nil {
		t.Skip("'ideas' command not yet registered")
	}

	for _, flagName := range []string{"all", "json", "quiet"} {
		if ideasCmd.Flags().Lookup(flagName) == nil && ideasCmd.PersistentFlags().Lookup(flagName) == nil {
			// Try inherited flags too
			if f := ideasCmd.InheritedFlags().Lookup(flagName); f == nil {
				t.Errorf("expected --%s flag on 'ideas' command", flagName)
			}
		}
	}
}

// TestIdeas_AddSubcommand_HasTagsAndSummaryFlags verifies --tags and --summary
// flags are defined on the add subcommand.
func TestIdeas_AddSubcommand_HasTagsAndSummaryFlags(t *testing.T) {
	ideasCmd := findCommand(rootCmd, "ideas")
	if ideasCmd == nil {
		t.Skip("'ideas' command not yet registered")
	}
	addCmd := findCommand(ideasCmd, "add")
	if addCmd == nil {
		t.Skip("'add' subcommand not yet registered")
	}

	if addCmd.Flags().Lookup("tags") == nil {
		t.Error("expected --tags flag on 'ideas add' subcommand")
	}
	if addCmd.Flags().Lookup("summary") == nil {
		t.Error("expected --summary flag on 'ideas add' subcommand")
	}
}

