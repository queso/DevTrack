package cmd

// swagger-jack:custom:start register
// This file implements the `devtrack register` command, which reads a project.yaml
// from the current directory and creates or updates the project via the API.
// swagger-jack:custom:end

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"devtrack/internal"
	"devtrack/internal/client"

	"github.com/spf13/cobra"
)

// ProjectAPI is the interface runRegister accepts so callers can provide any
// API client without coupling to a concrete implementation.
type ProjectAPI interface {
	ListProjects() ([]internal.ProjectSummary, error)
	CreateProject(body map[string]interface{}) ([]byte, error)
	UpdateProject(id string, body map[string]interface{}) ([]byte, error)
}

// apiProjectClient adapts the HTTP client to satisfy ProjectAPI.
type apiProjectClient struct {
	c *client.Client
}

func (a *apiProjectClient) ListProjects() ([]internal.ProjectSummary, error) {
	resp, err := a.c.Do("GET", "/projects", map[string]string{}, map[string]string{"per_page": "1000"}, nil)
	if err != nil {
		return nil, err
	}

	// The API returns a paginated response: {"data": [...], "pagination": {...}}
	// Try both shapes: array at top-level and wrapped in "data".
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(resp, &raw); err == nil {
		if dataRaw, ok := raw["data"]; ok {
			var projects []internal.ProjectSummary
			if err := json.Unmarshal(dataRaw, &projects); err != nil {
				return nil, fmt.Errorf("parse projects list: %w", err)
			}
			return projects, nil
		}
	}

	// Fallback: top-level array.
	var projects []internal.ProjectSummary
	if err := json.Unmarshal(resp, &projects); err != nil {
		return nil, fmt.Errorf("parse projects list: %w", err)
	}
	return projects, nil
}

func (a *apiProjectClient) CreateProject(body map[string]interface{}) ([]byte, error) {
	return a.c.Do("POST", "/projects", map[string]string{}, map[string]string{}, body)
}

func (a *apiProjectClient) UpdateProject(id string, body map[string]interface{}) ([]byte, error) {
	return a.c.Do("PATCH", "/projects/{id}", map[string]string{"id": id}, map[string]string{}, body)
}

// runRegister is the testable core of the register command. It reads the manifest
// at manifestPath, finds or creates the project via the API, and writes the UUID
// to out. When quiet is true, only the UUID is written.
func runRegister(manifestPath string, api ProjectAPI, quiet bool, out io.Writer) error {
	manifest, err := internal.ReadManifest(manifestPath)
	if err != nil {
		return err
	}

	projects, err := api.ListProjects()
	if err != nil {
		return fmt.Errorf("list projects from API: %w", err)
	}

	existingID := findProjectByName(projects, manifest.Name)

	if existingID != "" {
		return updateExistingProject(api, existingID, manifest, quiet, out)
	}
	return createNewProject(api, manifest, quiet, out)
}

// findProjectByName returns the ID of the first project matching name, or empty string.
func findProjectByName(projects []internal.ProjectSummary, name string) string {
	for _, p := range projects {
		if p.Name == name {
			return p.ID
		}
	}
	return ""
}

// manifestToBody converts a Manifest into the request body map for the API.
func manifestToBody(manifest *internal.Manifest) map[string]interface{} {
	body := map[string]interface{}{
		"name":     manifest.Name,
		"workflow": manifest.Workflow,
	}
	if manifest.RepoURL != "" {
		body["repo_url"] = manifest.RepoURL
	}
	if manifest.Domain != "" {
		body["domain"] = manifest.Domain
	}
	if manifest.MainBranch != "" {
		body["main_branch"] = manifest.MainBranch
	}
	if manifest.PrdPath != "" {
		body["prd_path"] = manifest.PrdPath
	}
	if manifest.ContentPath != "" {
		body["content_path"] = manifest.ContentPath
	}
	if manifest.DraftPath != "" {
		body["draft_path"] = manifest.DraftPath
	}
	if len(manifest.Tags) > 0 {
		body["tags"] = manifest.Tags
	}
	return body
}

// extractProjectID parses the project UUID from the API response JSON.
func extractProjectID(resp []byte) (string, error) {
	var result map[string]interface{}
	if err := json.Unmarshal(resp, &result); err != nil {
		return "", fmt.Errorf("parse API response: %w", err)
	}
	id, ok := result["id"].(string)
	if !ok || id == "" {
		return "", fmt.Errorf("API response missing project id")
	}
	return id, nil
}

func createNewProject(api ProjectAPI, manifest *internal.Manifest, quiet bool, out io.Writer) error {
	resp, err := api.CreateProject(manifestToBody(manifest))
	if err != nil {
		return fmt.Errorf("create project: %w", err)
	}
	id, err := extractProjectID(resp)
	if err != nil {
		return err
	}
	writeProjectOutput(out, id, "created", quiet)
	return nil
}

func updateExistingProject(api ProjectAPI, id string, manifest *internal.Manifest, quiet bool, out io.Writer) error {
	resp, err := api.UpdateProject(id, manifestToBody(manifest))
	if err != nil {
		return fmt.Errorf("update project: %w", err)
	}
	updatedID, err := extractProjectID(resp)
	if err != nil {
		return err
	}
	writeProjectOutput(out, updatedID, "updated", quiet)
	return nil
}

// writeProjectOutput writes the UUID (and optional status label) to out.
func writeProjectOutput(out io.Writer, id, action string, quiet bool) {
	if quiet {
		fmt.Fprintln(out, id)
		return
	}
	fmt.Fprintf(out, "Project %s: %s\n", action, id)
}

// registerCmd is the cobra command for `devtrack register`.
var registerCmd = &cobra.Command{
	Use:   "register",
	Short: "Register the current project with DevTrack",
	Long:  "Reads project.yaml from the current directory and creates or updates the project via the API.",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		manifestPath, err := internal.FindManifest()
		if err != nil {
			return err
		}

		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		api := &apiProjectClient{c: c}

		quiet, _ := cmd.Flags().GetBool("quiet")

		return runRegister(manifestPath, api, quiet, cmd.OutOrStdout())
	},
}

func init() {
	rootCmd.AddCommand(registerCmd)
	registerCmd.Flags().Bool("quiet", false, "Output only the project UUID")
}
