package cmd

// swagger-jack:custom:start ideas-command

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"devtrack/internal"
	"devtrack/internal/client"
	"devtrack/internal/response"

	"github.com/spf13/cobra"
)

// IdeasAPI is the interface accepted by runListIdeas and runAddIdea, allowing
// tests to substitute fakes without coupling to the HTTP client.
type IdeasAPI interface {
	ListProjects() ([]internal.ProjectSummary, error)
	// ListProjectIdeas fetches ideas for a specific project.
	// API endpoint: GET /api/v1/projects/:id/ideas
	ListProjectIdeas(projectID string) ([]byte, error)
	// ListAllIdeas fetches ideas across all projects.
	// API endpoint: GET /api/v1/ideas
	ListAllIdeas() ([]byte, error)
	// AddIdea creates a new idea.
	// API endpoint: POST /api/v1/ideas
	AddIdea(body map[string]interface{}) ([]byte, error)
}

// apiIdeasClient adapts client.Client to satisfy IdeasAPI.
type apiIdeasClient struct {
	c *client.Client
}

func (a *apiIdeasClient) ListProjects() ([]internal.ProjectSummary, error) {
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

func (a *apiIdeasClient) ListProjectIdeas(projectID string) ([]byte, error) {
	return a.c.Do("GET", "/projects/{id}/ideas", map[string]string{"id": projectID}, map[string]string{}, nil)
}

func (a *apiIdeasClient) ListAllIdeas() ([]byte, error) {
	return a.c.Do("GET", "/ideas", map[string]string{}, map[string]string{}, nil)
}

func (a *apiIdeasClient) AddIdea(body map[string]interface{}) ([]byte, error) {
	return a.c.Do("POST", "/ideas", map[string]string{}, map[string]string{}, body)
}

// runListIdeas is the testable core of `devtrack ideas`. When all is true the
// project.yaml lookup is bypassed and all ideas are returned. When all is false
// the manifest at manifestPath is read and the project is resolved before
// fetching project-scoped ideas.
func runListIdeas(manifestPath string, all bool, api IdeasAPI, jsonMode bool, quiet bool, out io.Writer) error {
	if all {
		body, err := api.ListAllIdeas()
		if err != nil {
			return wrapAuthError(err)
		}
		return printIdeasBody(body, jsonMode, quiet, out)
	}

	manifest, err := internal.ReadManifest(manifestPath)
	if err != nil {
		return fmt.Errorf("%w — use --all to list ideas across all projects", err)
	}

	projectID, err := internal.ResolveProjectID(api, manifest)
	if err != nil {
		return fmt.Errorf("resolving project: %w", err)
	}

	body, err := api.ListProjectIdeas(projectID)
	if err != nil {
		return wrapAuthError(err)
	}

	return printIdeasBody(body, jsonMode, quiet, out)
}

// runAddIdea is the testable core of `devtrack ideas add`.
func runAddIdea(title string, tags []string, summary string, api IdeasAPI, jsonMode bool, quiet bool, out io.Writer) error {
	if title == "" {
		return fmt.Errorf("title is required")
	}

	body := map[string]interface{}{
		"title": title,
	}
	if len(tags) > 0 {
		body["tags"] = tags
	}
	if summary != "" {
		body["summary"] = summary
	}

	resp, err := api.AddIdea(body)
	if err != nil {
		return wrapAuthError(err)
	}

	if quiet {
		var result map[string]interface{}
		if err := json.Unmarshal(resp, &result); err == nil {
			if id, ok := result["id"].(string); ok {
				fmt.Fprintln(out, id)
			}
		}
		return nil
	}

	if jsonMode {
		fmt.Fprintf(out, "%s\n", string(resp))
		return nil
	}

	fmt.Fprintf(out, "%s\n", string(resp))
	return nil
}

// printIdeasBody writes the API response to out in the requested format.
// In quiet mode only the idea IDs are written, one per line.
func printIdeasBody(body []byte, jsonMode bool, quiet bool, out io.Writer) error {
	if quiet {
		var ideas []map[string]interface{}
		if err := json.Unmarshal(body, &ideas); err != nil {
			return fmt.Errorf("parse ideas response: %w", err)
		}
		for _, idea := range ideas {
			if id, ok := idea["id"].(string); ok {
				fmt.Fprintln(out, id)
			}
		}
		return nil
	}

	if jsonMode {
		fmt.Fprintf(out, "%s\n", string(body))
		return nil
	}

	fmt.Fprintf(out, "%s\n", string(body))
	return nil
}

// wrapAuthError wraps 401 errors with a user-friendly message about the API key.
func wrapAuthError(err error) error {
	if err == nil {
		return nil
	}
	if strings.Contains(err.Error(), "401") {
		return fmt.Errorf("authentication failed (401): check your DEVTRACK_TOKEN / API key — %w", err)
	}
	return err
}

// ideasCmd is the cobra command for `devtrack ideas`.
var ideasCmd = &cobra.Command{
	Use:   "ideas",
	Short: "List and manage content ideas",
	Long:  "List content ideas for the current project, or add new ones.",
	RunE: func(cmd *cobra.Command, args []string) error {
		all, _ := cmd.Flags().GetBool("all")
		quiet, _ := cmd.Flags().GetBool("quiet")
		jsonMode, _ := cmd.Root().PersistentFlags().GetBool("json")

		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		api := &apiIdeasClient{c: client.NewClient(baseURL, token)}

		manifestPath := ""
		if !all {
			var err error
			manifestPath, err = internal.FindManifest()
			if err != nil {
				return fmt.Errorf("%w — use --all to list ideas across all projects", err)
			}
		}

		return runListIdeas(manifestPath, all, api, jsonMode, quiet, cmd.OutOrStdout())
	},
}

// ideasAddCmd is the `devtrack ideas add` subcommand.
var ideasAddCmd = &cobra.Command{
	Use:   "add <title>",
	Short: "Add a new content idea",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		title := args[0]
		quiet, _ := cmd.Parent().Flags().GetBool("quiet")
		jsonMode, _ := cmd.Root().PersistentFlags().GetBool("json")

		tagsStr, _ := cmd.Flags().GetString("tags")
		summary, _ := cmd.Flags().GetString("summary")

		var tags []string
		if tagsStr != "" {
			for _, t := range strings.Split(tagsStr, ",") {
				if trimmed := strings.TrimSpace(t); trimmed != "" {
					tags = append(tags, trimmed)
				}
			}
		}

		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		api := &apiIdeasClient{c: client.NewClient(baseURL, token)}

		return runAddIdea(title, tags, summary, api, jsonMode, quiet, cmd.OutOrStdout())
	},
}

func init() {
	rootCmd.AddCommand(ideasCmd)
	ideasCmd.Flags().Bool("all", false, "List ideas across all projects")
	ideasCmd.Flags().Bool("quiet", false, "Output only idea IDs, one per line")

	ideasCmd.AddCommand(ideasAddCmd)
	ideasAddCmd.Flags().String("tags", "", "Comma-separated list of tags")
	ideasAddCmd.Flags().String("summary", "", "Short summary for the idea")
}

// swagger-jack:custom:end
