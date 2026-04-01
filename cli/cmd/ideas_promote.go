package cmd

// swagger-jack:custom:start ideas-promote

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"

	"devtrack/internal"
	"devtrack/internal/client"

	"github.com/spf13/cobra"
)

// PromoteIdeaAPI is the interface accepted by runPromoteIdea.
type PromoteIdeaAPI interface {
	// PromoteIdea patches the idea status to "promoted".
	// API endpoint: PATCH /api/v1/ideas/:id
	PromoteIdea(id string) ([]byte, error)
}

// apiPromoteClient adapts client.Client to satisfy PromoteIdeaAPI.
type apiPromoteClient struct {
	c *client.Client
}

func (a *apiPromoteClient) PromoteIdea(id string) ([]byte, error) {
	body := map[string]interface{}{"status": "promoted"}
	return a.c.Do("PATCH", "/ideas/{id}", map[string]string{"id": id}, map[string]string{}, body)
}

// ideaResponse holds the fields we need from the promoted-idea API response.
type ideaResponse struct {
	ID    string   `json:"id"`
	Title string   `json:"title"`
	Tags  []string `json:"tags"`
}

// runPromoteIdea is the testable core of `devtrack ideas promote`.
// It reads the manifest, validates that draft_path is configured, calls
// PromoteIdea, then creates a draft markdown file with YAML frontmatter
// derived from the API response. If the target file already exists the
// command prints a warning and returns without overwriting.
func runPromoteIdea(ideaID string, manifestPath string, api PromoteIdeaAPI, jsonMode bool, out io.Writer) error {
	manifest, err := internal.ReadManifest(manifestPath)
	if err != nil {
		return err
	}

	if manifest.DraftPath == "" {
		return fmt.Errorf("draft_path is not set in project.yaml — set draft_path to enable idea promotion")
	}

	resp, err := api.PromoteIdea(ideaID)
	if err != nil {
		return fmt.Errorf("promote idea: %w", err)
	}

	if jsonMode {
		fmt.Fprintf(out, "%s\n", string(resp))
	}

	var idea ideaResponse
	if err := json.Unmarshal(resp, &idea); err != nil {
		return fmt.Errorf("parse promote response: %w", err)
	}

	slug := slugify(idea.Title)
	if slug == "" {
		return fmt.Errorf("idea title produces empty slug; use a title with at least one letter or number")
	}
	draftDir := filepath.Join(filepath.Dir(manifestPath), manifest.DraftPath)
	if err := os.MkdirAll(draftDir, 0o755); err != nil {
		return fmt.Errorf("create draft directory: %w", err)
	}

	targetPath := filepath.Join(draftDir, slug+".md")
	if _, err := os.Stat(targetPath); err == nil {
		fmt.Fprintf(out, "Warning: draft file already exists at %s — skipping\n", targetPath)
		return nil
	}

	fileContent := buildDraftFrontmatter(idea.Title, idea.Tags)
	if err := os.WriteFile(targetPath, []byte(fileContent), 0o644); err != nil {
		return fmt.Errorf("write draft file: %w", err)
	}

	if !jsonMode {
		fmt.Fprintf(out, "Created draft: %s\n", targetPath)
	}
	return nil
}

// buildDraftFrontmatter renders the YAML frontmatter block for a new draft file.
func buildDraftFrontmatter(title string, tags []string) string {
	date := time.Now().UTC().Format("2006-01-02")

	tagLines := "[]"
	if len(tags) > 0 {
		quoted := make([]string, len(tags))
		for i, t := range tags {
			quoted[i] = fmt.Sprintf("%q", t)
		}
		tagLines = "[" + strings.Join(quoted, ", ") + "]"
	}

	return fmt.Sprintf("---\ntitle: %q\ntags: %s\ndate: %q\n---\n", title, tagLines, date)
}

// slugify converts a human-readable title into a URL-safe slug:
// lowercase, spaces replaced with hyphens, non-alphanumeric characters
// stripped, consecutive hyphens collapsed, leading/trailing hyphens trimmed.
func slugify(title string) string {
	// Lowercase first.
	s := strings.ToLower(title)

	// Map each rune: alphanumeric → keep, space → hyphen, else → discard.
	var b strings.Builder
	for _, r := range s {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-':
			b.WriteRune(r)
		case r == ' ':
			b.WriteRune('-')
		// All other characters are dropped.
		}
	}

	// Collapse consecutive hyphens and trim.
	collapsed := regexp.MustCompile(`-{2,}`).ReplaceAllString(b.String(), "-")
	return strings.Trim(collapsed, "-")
}

// promoteCmd is the `devtrack ideas promote` subcommand.
var promoteCmd = &cobra.Command{
	Use:   "promote <idea-id>",
	Short: "Promote an idea to a draft post",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ideaID := args[0]
		jsonMode, _ := cmd.Root().PersistentFlags().GetBool("json")

		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		api := &apiPromoteClient{c: client.NewClient(baseURL, token)}

		manifestPath, err := internal.FindManifest()
		if err != nil {
			return err
		}

		return runPromoteIdea(ideaID, manifestPath, api, jsonMode, cmd.OutOrStdout())
	},
}

func init() {
	ideasCmd.AddCommand(promoteCmd)
}

// swagger-jack:custom:end
