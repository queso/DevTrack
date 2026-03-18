package internal

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// Manifest represents the contents of a project.yaml file.
type Manifest struct {
	Name        string   `yaml:"name"`
	Workflow    string   `yaml:"workflow"`
	Domain      string   `yaml:"domain"`
	Tags        []string `yaml:"tags"`
	RepoURL     string   `yaml:"repo_url"`
	MainBranch  string   `yaml:"main_branch"`
	PrdPath     string   `yaml:"prd_path"`
	ContentPath string   `yaml:"content_path"`
	DraftPath   string   `yaml:"draft_path"`
}

// ProjectLister is the interface ResolveProjectID accepts so callers can
// provide any API client without coupling to a concrete implementation.
type ProjectLister interface {
	ListProjects() ([]ProjectSummary, error)
}

// ProjectSummary is the minimal project info returned by the API list endpoint.
type ProjectSummary struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	RepoURL string `json:"repo_url"`
}

// ReadManifest reads and parses the project.yaml at the given path.
// It returns an error if the file does not exist, contains invalid YAML,
// or is empty (no name field).
func ReadManifest(path string) (*Manifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read manifest %q: %w", path, err)
	}

	var m Manifest
	if err := yaml.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest %q: %w", path, err)
	}

	if strings.TrimSpace(m.Name) == "" {
		return nil, fmt.Errorf("manifest %q: name field is required", path)
	}

	if m.Workflow != "sdlc" && m.Workflow != "content" {
		return nil, fmt.Errorf("manifest %q: workflow must be \"sdlc\" or \"content\", got %q", path, m.Workflow)
	}

	return &m, nil
}

// FindManifest walks up the directory tree from the current working directory
// looking for a project.yaml file. It returns the absolute path of the first
// match, or an error if none is found before reaching the filesystem root.
func FindManifest() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("getwd: %w", err)
	}

	for {
		candidate := filepath.Join(dir, "project.yaml")
		if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
			return candidate, nil
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			// Reached the filesystem root with no match.
			return "", fmt.Errorf("project.yaml not found in %q or any parent directory", dir)
		}
		dir = parent
	}
}

// normalizeRepoURL strips trailing slashes and .git suffix for comparison.
func normalizeRepoURL(u string) string {
	u = strings.TrimRight(u, "/")
	u = strings.TrimSuffix(u, ".git")
	return u
}

// ResolveProjectID finds the project UUID that matches the given manifest by
// comparing the manifest name and repo URL against projects returned by the
// API. Name match is preferred; repo URL match is the fallback.
func ResolveProjectID(lister ProjectLister, manifest *Manifest) (string, error) {
	projects, err := lister.ListProjects()
	if err != nil {
		return "", fmt.Errorf("list projects: %w", err)
	}

	// First pass: match by name.
	for _, p := range projects {
		if p.Name == manifest.Name {
			return p.ID, nil
		}
	}

	// Second pass: match by repo URL when a URL is provided.
	if manifest.RepoURL != "" {
		normManifest := normalizeRepoURL(manifest.RepoURL)
		for _, p := range projects {
			if normalizeRepoURL(p.RepoURL) == normManifest {
				return p.ID, nil
			}
		}
	}

	return "", fmt.Errorf("no project found matching name %q or repo URL %q", manifest.Name, manifest.RepoURL)
}
