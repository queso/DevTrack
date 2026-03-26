package cmd

// swagger-jack:custom:start register
// This file implements the `devtrack register` command, which reads a project.yaml
// from the current directory and creates or updates the project via the API.
// swagger-jack:custom:end

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"

	"devtrack/internal"
	"devtrack/internal/client"
	"devtrack/internal/response"

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

	var projects []internal.ProjectSummary
	if err := response.UnmarshalPaginated(resp, &projects); err != nil {
		return nil, fmt.Errorf("parse projects list: %w", err)
	}
	return projects, nil
}

func (a *apiProjectClient) CreateProject(body map[string]interface{}) ([]byte, error) {
	resp, err := a.c.Do("POST", "/projects", map[string]string{}, map[string]string{}, body)
	if err != nil {
		return nil, fmt.Errorf("create project: %w", err)
	}
	return resp, nil
}

func (a *apiProjectClient) UpdateProject(id string, body map[string]interface{}) ([]byte, error) {
	resp, err := a.c.Do("PATCH", "/projects/{id}", map[string]string{"id": id}, map[string]string{}, body)
	if err != nil {
		return nil, fmt.Errorf("update project: %w", err)
	}
	return resp, nil
}

// registerDeps holds injectable dependencies for runRegister, enabling unit tests
// to stub out git, stdin, and hooks installation without spawning real processes.
type registerDeps struct {
	// getGitURL is called when manifest.RepoURL is empty to auto-detect the URL
	// from the local git remote. When nil, auto-detection is skipped.
	getGitURL func() (string, error)

	// confirm prompts the user with the given message and returns true if they
	// accept. When nil, a real stdin prompt is used.
	confirm func(prompt string, out io.Writer) bool

	// installHooks runs `devtrack hooks install` for the current repo.
	// When nil, hooks installation is skipped even if the user accepts.
	installHooks func() error
}

// defaultGetGitURL runs `git remote get-url origin` in the current directory.
func defaultGetGitURL() (string, error) {
	out, err := exec.Command("git", "remote", "get-url", "origin").Output()
	if err != nil {
		return "", fmt.Errorf("git remote get-url origin: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// stdinConfirm prompts the user on out and reads a y/n answer from os.Stdin.
func stdinConfirm(prompt string, out io.Writer) bool {
	fmt.Fprintf(out, "%s [y/N]: ", prompt)
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		answer := strings.TrimSpace(strings.ToLower(scanner.Text()))
		return answer == "y" || answer == "yes"
	}
	return false
}

// runRegister is the testable core of the register command. It reads the manifest
// at manifestPath, finds or creates the project via the API, and writes the UUID
// to out. When quiet is true, only the UUID is written.
//
// The optional deps parameter allows tests to inject fakes for git, stdin, and
// hooks installation. Callers that omit deps (legacy 4-arg calls) get zero values,
// which means auto-detection and prompting are skipped in those call sites.
func runRegister(manifestPath string, api ProjectAPI, quiet bool, out io.Writer, deps ...registerDeps) error {
	var d registerDeps
	if len(deps) > 0 {
		d = deps[0]
	}

	manifest, err := internal.ReadManifest(manifestPath)
	if err != nil {
		return err
	}

	// Auto-detect repo_url when not set in manifest.
	if manifest.RepoURL == "" && d.getGitURL != nil {
		if url, gitErr := d.getGitURL(); gitErr == nil {
			manifest.RepoURL = url
		}
	}

	projects, err := api.ListProjects()
	if err != nil {
		return fmt.Errorf("list projects from API: %w", err)
	}

	existingID := internal.FindProjectIDByName(projects, manifest.Name)

	if existingID != "" {
		return updateExistingProject(api, existingID, manifest, quiet, out)
	}
	return createNewProject(api, manifest, quiet, out, d)
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

func createNewProject(api ProjectAPI, manifest *internal.Manifest, quiet bool, out io.Writer, d registerDeps) error {
	resp, err := api.CreateProject(manifestToBody(manifest))
	if err != nil {
		return fmt.Errorf("create project: %w", err)
	}
	id, err := extractProjectID(resp)
	if err != nil {
		return err
	}
	writeProjectOutput(out, id, "created", quiet)

	// After a successful create, offer to install hooks (skip in quiet mode).
	if !quiet && d.confirm != nil {
		confirmFn := d.confirm
		if confirmFn("Install DevTrack git hooks for this project?", out) && d.installHooks != nil {
			if hookErr := d.installHooks(); hookErr != nil {
				fmt.Fprintf(out, "Warning: hooks install failed: %v\n", hookErr)
			}
		}
	}

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

		cwd, err := os.Getwd()
		if err != nil {
			cwd = "."
		}

		deps := registerDeps{
			getGitURL: defaultGetGitURL,
			confirm:   stdinConfirm,
			installHooks: func() error {
				return installHooks(cwd, quiet)
			},
		}

		return runRegister(manifestPath, api, quiet, cmd.OutOrStdout(), deps)
	},
}

func init() {
	rootCmd.AddCommand(registerCmd)
	registerCmd.Flags().Bool("quiet", false, "Output only the project UUID")
}
