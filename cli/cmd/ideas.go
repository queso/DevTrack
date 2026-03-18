package cmd

// swagger-jack:custom:start ideas
// This file implements the `devtrack ideas` command with `list` and `add`
// subcommands. Ideas represent content concepts captured against a project.
// swagger-jack:custom:end

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"text/tabwriter"

	"devtrack/internal"
	"devtrack/internal/client"
	"devtrack/internal/response"

	"github.com/spf13/cobra"
)

// IdeasAPI is the interface that runIdeasList and runIdeasAdd accept.
// It abstracts over the real HTTP client so tests run without a live server.
type IdeasAPI interface {
	// ListIdeas returns all ideas for the given project.
	ListIdeas(projectID string) ([]IdeaSummary, error)
	// CreateIdea creates a new idea and returns the created idea as raw JSON.
	CreateIdea(projectID string, body map[string]interface{}) ([]byte, error)
	// ListProjects is used to resolve the project from the manifest.
	ListProjects() ([]internal.ProjectSummary, error)
}

// IdeaSummary holds the fields we display in idea listings.
type IdeaSummary struct {
	ID      string   `json:"id"`
	Title   string   `json:"title"`
	Tags    []string `json:"tags"`
	Summary string   `json:"summary"`
}

// apiIdeasClient adapts the HTTP client to satisfy IdeasAPI.
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

func (a *apiIdeasClient) ListIdeas(projectID string) ([]IdeaSummary, error) {
	resp, err := a.c.Do("GET", "/projects/{id}/ideas", map[string]string{"id": projectID}, map[string]string{"per_page": "1000"}, nil)
	if err != nil {
		return nil, err
	}
	var ideas []IdeaSummary
	if err := response.UnmarshalPaginated(resp, &ideas); err != nil {
		return nil, fmt.Errorf("parse ideas list: %w", err)
	}
	return ideas, nil
}

func (a *apiIdeasClient) CreateIdea(projectID string, body map[string]interface{}) ([]byte, error) {
	return a.c.Do("POST", "/projects/{id}/ideas", map[string]string{"id": projectID}, map[string]string{}, body)
}

// resolveProjectIDFromManifest reads the manifest at manifestPath and finds the
// matching project via the API.
func resolveProjectIDFromManifest(manifestPath string, api IdeasAPI) (string, error) {
	manifest, err := internal.ReadManifest(manifestPath)
	if err != nil {
		return "", err
	}

	projects, err := api.ListProjects()
	if err != nil {
		return "", fmt.Errorf("list projects from API: %w", err)
	}

	id := internal.FindProjectIDByName(projects, manifest.Name)
	if id == "" {
		return "", fmt.Errorf("project %q not found — run 'devtrack register' to register it first", manifest.Name)
	}
	return id, nil
}

// runIdeasList fetches and displays ideas for the project identified by the
// manifest at manifestPath. When quiet is true only bare IDs are written.
func runIdeasList(manifestPath string, api IdeasAPI, quiet bool, out io.Writer) error {
	projectID, err := resolveProjectIDFromManifest(manifestPath, api)
	if err != nil {
		return err
	}

	ideas, err := api.ListIdeas(projectID)
	if err != nil {
		return fmt.Errorf("list ideas: %w", err)
	}

	if quiet {
		for _, idea := range ideas {
			fmt.Fprintln(out, idea.ID)
		}
		return nil
	}

	if len(ideas) == 0 {
		fmt.Fprintln(out, "No ideas found for this project.")
		return nil
	}

	tw := tabwriter.NewWriter(out, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "ID\tTITLE\tTAGS\tSUMMARY")
	fmt.Fprintln(tw, "--\t-----\t----\t-------")
	for _, idea := range ideas {
		tags := strings.Join(idea.Tags, ",")
		fmt.Fprintf(tw, "%s\t%s\t%s\t%s\n", idea.ID, idea.Title, tags, idea.Summary)
	}
	return tw.Flush()
}

// runIdeasAdd creates a new idea for the project identified by the manifest at
// manifestPath. When quiet is true only the new idea's ID is written.
func runIdeasAdd(manifestPath, title string, tags []string, summary string, api IdeasAPI, quiet bool, out io.Writer) error {
	projectID, err := resolveProjectIDFromManifest(manifestPath, api)
	if err != nil {
		return err
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

	resp, err := api.CreateIdea(projectID, body)
	if err != nil {
		return fmt.Errorf("create idea: %w", err)
	}

	ideaID, err := extractIdeaID(resp)
	if err != nil {
		return err
	}

	if quiet {
		fmt.Fprintln(out, ideaID)
		return nil
	}

	fmt.Fprintf(out, "Idea created: %s\n", ideaID)
	return nil
}

// extractIdeaID parses the idea UUID from the API response JSON.
func extractIdeaID(resp []byte) (string, error) {
	var result map[string]interface{}
	if err := json.Unmarshal(resp, &result); err != nil {
		return "", fmt.Errorf("parse API response: %w", err)
	}
	id, ok := result["id"].(string)
	if !ok || id == "" {
		return "", fmt.Errorf("API response missing idea id")
	}
	return id, nil
}

// ideasCmd is the cobra command for `devtrack ideas`.
var ideasCmd = &cobra.Command{
	Use:   "ideas",
	Short: "Manage ideas for the current project",
	Long:  "List and create ideas for the project defined by project.yaml in the current directory.",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runIdeasListFromCmd(cmd)
	},
}

// ideasListCmd is the cobra command for `devtrack ideas list`.
var ideasListCmd = &cobra.Command{
	Use:   "list",
	Short: "List ideas for the current project",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runIdeasListFromCmd(cmd)
	},
}

func runIdeasListFromCmd(cmd *cobra.Command) error {
	manifestPath, err := internal.FindManifest()
	if err != nil {
		return err
	}

	baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
	token := os.Getenv("DEVTRACK_TOKEN")
	c := client.NewClient(baseURL, token)
	api := &apiIdeasClient{c: c}

	quiet, _ := cmd.Flags().GetBool("quiet")

	return runIdeasList(manifestPath, api, quiet, cmd.OutOrStdout())
}

// ideasAddCmd is the cobra command for `devtrack ideas add`.
var ideasAddCmd = &cobra.Command{
	Use:   "add <title>",
	Short: "Add a new idea to the current project",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		manifestPath, err := internal.FindManifest()
		if err != nil {
			return err
		}

		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		api := &apiIdeasClient{c: c}

		tags, _ := cmd.Flags().GetStringSlice("tags")
		summary, _ := cmd.Flags().GetString("summary")

		quiet, _ := cmd.Flags().GetBool("quiet")

		return runIdeasAdd(manifestPath, args[0], tags, summary, api, quiet, cmd.OutOrStdout())
	},
}

func init() {
	rootCmd.AddCommand(ideasCmd)
	ideasCmd.AddCommand(ideasListCmd)
	ideasCmd.AddCommand(ideasAddCmd)

	ideasCmd.Flags().Bool("quiet", false, "Output only idea IDs")

	ideasAddCmd.Flags().StringSlice("tags", nil, "Comma-separated tags for the idea")
	ideasAddCmd.Flags().String("summary", "", "Brief summary of the idea")
}
