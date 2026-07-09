package cmd

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spf13/cobra"

	"devtrack/internal/redact"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func writeYAML(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("writeYAML: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Event type mapping tests
// ---------------------------------------------------------------------------

func TestMapEventType_HyphenatedToUnderscore(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"session-start", "session_start"},
		{"session-end", "session_end"},
		{"prd-updated", "prd_updated"},
		// Non-hyphenated types pass through unchanged.
		{"commit", "commit"},
		{"push", "push"},
	}
	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			got := mapEventType(tc.input)
			if got != tc.want {
				t.Errorf("mapEventType(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Valid event type acceptance tests
// ---------------------------------------------------------------------------

func TestValidateEventType_AllValidTypesAccepted(t *testing.T) {
	validTypes := []string{
		"commit",
		"push",
		"session-start",
		"session-end",
		"prd-updated",
	}
	for _, et := range validTypes {
		t.Run(et, func(t *testing.T) {
			if err := validateEventType(et); err != nil {
				t.Errorf("validateEventType(%q) returned unexpected error: %v", et, err)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Invalid event type rejection tests
// ---------------------------------------------------------------------------

func TestValidateEventType_InvalidTypeReturnsError(t *testing.T) {
	badTypes := []string{
		"unknown",
		"pr_opened", // raw API value not accepted; user must use convenience names
		"",
		"SESSION-START", // case-sensitive
	}
	for _, et := range badTypes {
		t.Run(et, func(t *testing.T) {
			if err := validateEventType(et); err == nil {
				t.Errorf("validateEventType(%q): expected error, got nil", et)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// project-yaml flag tests
// ---------------------------------------------------------------------------

func TestReadProjectYAML_ValidManifest(t *testing.T) {
	dir := t.TempDir()
	yamlPath := filepath.Join(dir, "project.yaml")
	writeYAML(t, yamlPath, "name: my-project\nworkflow: sdlc\n")

	name, err := projectNameFromYAML(yamlPath)
	if err != nil {
		t.Fatalf("projectNameFromYAML returned unexpected error: %v", err)
	}
	if name != "my-project" {
		t.Errorf("got project name %q, want %q", name, "my-project")
	}
}

func TestReadProjectYAML_MissingFileReturnsError(t *testing.T) {
	_, err := projectNameFromYAML("/nonexistent/path/project.yaml")
	if err == nil {
		t.Fatal("expected error for missing project.yaml, got nil")
	}
}

// ---------------------------------------------------------------------------
// Event command construction test
// ---------------------------------------------------------------------------

func TestEventCmd_Registered(t *testing.T) {
	// Verify the convenience "event" command is registered on rootCmd.
	found := false
	for _, sub := range rootCmd.Commands() {
		if sub.Name() == "event" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected 'event' command to be registered on rootCmd, but it was not found")
	}
}

// findCommand searches cmd's direct subcommands for one with the given name.
func findCommand(parent interface{ Commands() []*cobra.Command }, name string) *cobra.Command {
	for _, sub := range parent.Commands() {
		if sub.Name() == name {
			return sub
		}
	}
	return nil
}

func TestEventCmd_RequiredFlags(t *testing.T) {
	// Verify --type and --message flags exist on the event command.
	var eventCmd = findCommand(rootCmd, "event")
	if eventCmd == nil {
		t.Fatal("'event' command not found on rootCmd")
	}

	typeFlag := eventCmd.Flags().Lookup("type")
	if typeFlag == nil {
		t.Error("expected --type flag to be defined on 'event' command")
	}

	messageFlag := eventCmd.Flags().Lookup("message")
	if messageFlag == nil {
		t.Error("expected --message flag to be defined on 'event' command")
	}

	projectYAMLFlag := eventCmd.Flags().Lookup("project-yaml")
	if projectYAMLFlag == nil {
		t.Error("expected --project-yaml flag to be defined on 'event' command")
	}
}

// ---------------------------------------------------------------------------
// WI-581: sendEvent — the single enforcement point that resolves project
// identity (ResolveIdentity), redacts the title (redact.Redact), and POSTs the
// event via the client. Both the `event` command and (later) the tool_use hook
// route through it. Contract:
//
//	func sendEvent(eventType, title string, metadata map[string]interface{}) error
//
// It reads base-url from the root command's persistent flag and resolves
// identity from the current working directory.
// ---------------------------------------------------------------------------

type capturedEvent struct {
	path string
	body []byte
}

func (c *capturedEvent) decode(t *testing.T) map[string]interface{} {
	t.Helper()
	var m map[string]interface{}
	if err := json.Unmarshal(c.body, &m); err != nil {
		t.Fatalf("decode POST body %q: %v", string(c.body), err)
	}
	return m
}

// setupEventCapture stands up a test server that records the POSTed event body,
// points the CLI's base-url at it, and chdirs into a temp repo whose
// devtrack.yaml gives ResolveIdentity a deterministic identity (no git needed).
func setupEventCapture(t *testing.T, manifest string) *capturedEvent {
	t.Helper()
	cap := &capturedEvent{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cap.path = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		cap.body = b
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"data":{"id":"ev-1"}}`))
	}))
	t.Cleanup(srv.Close)

	prevURL, _ := rootCmd.PersistentFlags().GetString("base-url")
	if err := rootCmd.PersistentFlags().Set("base-url", srv.URL); err != nil {
		t.Fatalf("set base-url: %v", err)
	}
	t.Cleanup(func() { _ = rootCmd.PersistentFlags().Set("base-url", prevURL) })

	dir := t.TempDir()
	writeYAML(t, filepath.Join(dir, "devtrack.yaml"), manifest)
	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(origDir) })
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("Chdir: %v", err)
	}
	return cap
}

const acmeManifest = "name: acme-widgets\nrepo_url: https://github.com/acme/widgets\n"

// AC7: secret-shaped text in the title is masked in the POSTed payload.
func TestSendEvent_RedactsSecretInTitle(t *testing.T) {
	cap := setupEventCapture(t, acmeManifest)
	if err := sendEvent("commit", `export API_KEY=abc123def456`, nil); err != nil {
		t.Fatalf("sendEvent: %v", err)
	}
	title, _ := cap.decode(t)["title"].(string)
	if strings.Contains(title, "abc123def456") {
		t.Errorf("secret leaked in POSTed title %q", title)
	}
	if !strings.Contains(title, redact.Placeholder) {
		t.Errorf("expected redaction placeholder in title %q", title)
	}
}

// AC5: the body carries the resolved repo_url + derived project name, with no
// manifest path supplied (identity chain).
func TestSendEvent_IncludesResolvedIdentity(t *testing.T) {
	cap := setupEventCapture(t, acmeManifest)
	if err := sendEvent("commit", "did a thing", nil); err != nil {
		t.Fatalf("sendEvent: %v", err)
	}
	body := cap.decode(t)
	if body["repo_url"] != "https://github.com/acme/widgets" {
		t.Errorf("repo_url: got %v, want the resolved repo URL", body["repo_url"])
	}
	if body["project_name"] != "acme-widgets" {
		t.Errorf("project_name: got %v, want the resolved name", body["project_name"])
	}
	if cap.path != "/events" {
		t.Errorf("POST path: got %q, want /events", cap.path)
	}
}

// AC3: the new event types are accepted and sent with the correct API value.
func TestSendEvent_AcceptsNewEventTypes(t *testing.T) {
	for _, et := range []string{"tool_use", "checkout", "merge"} {
		t.Run(et, func(t *testing.T) {
			cap := setupEventCapture(t, acmeManifest)
			if err := sendEvent(et, "t", nil); err != nil {
				t.Fatalf("sendEvent(%q): %v", et, err)
			}
			if got := cap.decode(t)["type"]; got != et {
				t.Errorf("type: got %v, want %q", got, et)
			}
		})
	}
}

// AC6: structured metadata is forwarded intact — quotes, newlines, and shell
// metacharacters survive the round trip unmangled.
func TestSendEvent_ForwardsMetadataIntact(t *testing.T) {
	cap := setupEventCapture(t, acmeManifest)
	command := "echo \"hi\" | grep x\nsecond-line && cat f"
	if err := sendEvent("commit", "t", map[string]interface{}{"cmd": command}); err != nil {
		t.Fatalf("sendEvent: %v", err)
	}
	meta, ok := cap.decode(t)["metadata"].(map[string]interface{})
	if !ok {
		t.Fatalf("metadata missing or not an object: %v", cap.decode(t)["metadata"])
	}
	if meta["cmd"] != command {
		t.Errorf("metadata cmd mangled: got %q, want %q", meta["cmd"], command)
	}
}

// AC2 (event half): the `event` command routes through sendEvent — its POST is
// redacted and identity-resolved. If it bypassed the enforcement point (old
// behavior: raw title, no repo_url) these assertions fail. The tool_use hook
// half is covered by WI-584.
func TestEventCommand_RoutesThroughSendEvent(t *testing.T) {
	cap := setupEventCapture(t, acmeManifest)
	eventCmdType = "commit"
	eventCmdMessage = `export TOKEN=deadbeefsecret99`
	eventCmdMetadata = ""
	eventCmdProjectYAML = ""
	eventCmdQuiet = true
	t.Cleanup(func() {
		eventCmdType, eventCmdMessage, eventCmdQuiet = "", "", false
	})

	if err := eventCmd.RunE(eventCmd, nil); err != nil {
		t.Fatalf("event RunE: %v", err)
	}
	body := cap.decode(t)
	if title, _ := body["title"].(string); strings.Contains(title, "deadbeefsecret99") {
		t.Errorf("event command bypassed redaction — secret present in title %q", title)
	}
	if body["repo_url"] != "https://github.com/acme/widgets" {
		t.Errorf("event command bypassed identity resolution — repo_url %v", body["repo_url"])
	}
}
