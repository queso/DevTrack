package cmd

// swagger-jack:custom:start event-command

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"devtrack/internal"

	"devtrack/internal/client"
	"devtrack/internal/redact"
	"github.com/spf13/cobra"
)

// validEventTypes lists the user-facing event type names accepted by the
// convenience "event" command. Hyphenated names are mapped to underscores
// before being sent to the API.
var validEventTypes = []string{
	"commit",
	"push",
	"session-start",
	"session-end",
	"prd-updated",
	"tool_use",
	"checkout",
	"merge",
}

// mapEventType converts a hyphenated user-facing event type name (e.g.
// "session-start") to the underscore form required by the API
// (e.g. "session_start"). Types without hyphens pass through unchanged.
func mapEventType(eventType string) string {
	return strings.ReplaceAll(eventType, "-", "_")
}

// validateEventType returns an error when eventType is not one of the
// recognised user-facing event type names.
func validateEventType(eventType string) error {
	for _, valid := range validEventTypes {
		if eventType == valid {
			return nil
		}
	}
	return fmt.Errorf("invalid event type %q: must be one of %s", eventType, strings.Join(validEventTypes, ", "))
}

// projectNameFromYAML reads the project manifest at yamlPath and returns the
// project name field. It returns an error when the file is missing, unparseable,
// or has no name.
func projectNameFromYAML(yamlPath string) (string, error) {
	manifest, err := internal.ReadManifest(yamlPath)
	if err != nil {
		return "", err
	}
	return manifest.Name, nil
}

var (
	eventCmdType        string
	eventCmdMessage     string
	eventCmdMetadata    string
	eventCmdProjectYAML string
	eventCmdQuiet       bool
)

// sendEvent is the single enforcement point every outgoing event passes
// through: it resolves the project identity (devtrack.yaml -> git remote ->
// folder name, via internal.ResolveIdentity — a missing manifest never drops
// the event), redacts secret-shaped text out of the title, and POSTs the
// event. Both the `event` command and the tool_use hook (WI-584) route
// through this helper so the redaction/identity guarantee has one place to
// hold, per PRD FR-11. Per ADR 0001, this path is read-only: identity
// resolution never writes devtrack.yaml. Use `devtrack init` to provision one.
func sendEvent(eventType, title string, metadata map[string]interface{}) error {
	if err := validateEventType(eventType); err != nil {
		return err
	}
	apiType := mapEventType(eventType)

	var identity internal.Identity
	if eventCmdProjectYAML != "" {
		m, err := internal.ReadManifest(eventCmdProjectYAML)
		if err != nil {
			return fmt.Errorf("reading project manifest: %w", err)
		}
		identity = internal.Identity{Name: m.Name, RepoURL: m.RepoURL}
	} else {
		dir, _ := os.Getwd()
		identity, _ = internal.ResolveIdentity(dir, defaultGetGitURL)
	}

	bodyMap := map[string]interface{}{
		"type":        apiType,
		"title":       redact.Redact(title),
		"occurred_at": time.Now().UTC().Format(time.RFC3339),
	}
	if identity.Name != "" {
		bodyMap["project_name"] = identity.Name
	}
	if identity.RepoURL != "" {
		bodyMap["repo_url"] = identity.RepoURL
	}
	if metadata != nil {
		bodyMap["metadata"] = metadata
	}

	baseURL, _ := rootCmd.PersistentFlags().GetString("base-url")
	token := os.Getenv("DEVTRACK_TOKEN")
	c := client.NewClient(baseURL, token)

	_, err := c.Do("POST", "/events", map[string]string{}, map[string]string{}, bodyMap)
	return err
}

var eventCmd = &cobra.Command{
	Use:   "event",
	Short: "Record a developer event",
	Long:  "Record a developer event (commit, push, session-start, session-end, prd-updated, tool_use, checkout, merge) against a project. Project identity resolves through devtrack.yaml, the git remote URL, or the folder name.",
	RunE: func(cmd *cobra.Command, args []string) error {
		var metadata map[string]interface{}
		if eventCmdMetadata != "" {
			if err := json.Unmarshal([]byte(eventCmdMetadata), &metadata); err != nil {
				return fmt.Errorf("--metadata must be valid JSON object: %w", err)
			}
		}

		if err := sendEvent(eventCmdType, eventCmdMessage, metadata); err != nil {
			return err
		}

		if eventCmdQuiet {
			return nil
		}

		fmt.Println("Event recorded")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(eventCmd)
	eventCmd.Flags().StringVar(&eventCmdType, "type", "", "Event type (commit|push|session-start|session-end|prd-updated|tool_use|checkout|merge)")
	eventCmd.Flags().StringVar(&eventCmdMessage, "message", "", "Human-readable description of the event")
	eventCmd.Flags().StringVar(&eventCmdMetadata, "metadata", "", "Optional JSON metadata string")
	eventCmd.Flags().StringVar(&eventCmdProjectYAML, "project-yaml", "", "Explicit path to a devtrack.yaml manifest (optional; overrides the identity chain)")
	eventCmd.Flags().BoolVar(&eventCmdQuiet, "quiet", false, "Suppress output")
}

// swagger-jack:custom:end
