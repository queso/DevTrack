package cmd

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/cobra"
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
