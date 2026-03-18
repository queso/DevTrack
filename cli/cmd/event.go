package cmd

// swagger-jack:custom:start event-command

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"devtrack/internal"

	"github.com/spf13/cobra"
	"devtrack/internal/client"
	"devtrack/internal/output"
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

var eventCmd = &cobra.Command{
	Use:   "event",
	Short: "Record a developer event",
	Long:  "Record a developer event (commit, push, session-start, session-end, prd-updated) against a project.",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := validateEventType(eventCmdType); err != nil {
			return err
		}

		apiType := mapEventType(eventCmdType)

		bodyMap := map[string]interface{}{
			"type":        apiType,
			"title":       eventCmdMessage,
			"occurred_at": time.Now().UTC().Format(time.RFC3339),
		}

		if eventCmdMetadata != "" {
			var metaObj map[string]interface{}
			if err := json.Unmarshal([]byte(eventCmdMetadata), &metaObj); err != nil {
				return fmt.Errorf("--metadata must be valid JSON object: %w", err)
			}
			bodyMap["metadata"] = metaObj
		}

		if eventCmdProjectYAML != "" {
			projectName, err := projectNameFromYAML(eventCmdProjectYAML)
			if err != nil {
				return fmt.Errorf("reading project manifest: %w", err)
			}
			bodyMap["project_name"] = projectName
		}

		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)

		bodyBytes, err := json.Marshal(bodyMap)
		if err != nil {
			return fmt.Errorf("marshalling request body: %w", err)
		}

		var bodyObj interface{}
		_ = json.Unmarshal(bodyBytes, &bodyObj)

		resp, err := c.Do("POST", "/events", map[string]string{}, map[string]string{}, bodyObj)
		if err != nil {
			return err
		}

		if eventCmdQuiet {
			return nil
		}

		jsonMode, _ := cmd.Root().PersistentFlags().GetBool("json")
		noColor, _ := cmd.Root().PersistentFlags().GetBool("no-color")
		if jsonMode {
			fmt.Printf("%s\n", string(resp))
		} else {
			if err := output.PrintTable(resp, noColor); err != nil {
				fmt.Println(string(resp))
			}
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(eventCmd)
	eventCmd.Flags().StringVar(&eventCmdType, "type", "", "Event type (commit|push|session-start|session-end|prd-updated)")
	eventCmd.Flags().StringVar(&eventCmdMessage, "message", "", "Human-readable description of the event")
	eventCmd.Flags().StringVar(&eventCmdMetadata, "metadata", "", "Optional JSON metadata string")
	eventCmd.Flags().StringVar(&eventCmdProjectYAML, "project-yaml", "", "Path to project.yaml to resolve the project")
	eventCmd.Flags().BoolVar(&eventCmdQuiet, "quiet", false, "Suppress output")
}

// swagger-jack:custom:end
