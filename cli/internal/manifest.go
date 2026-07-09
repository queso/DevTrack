package internal

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// ManifestFilename is the name of the manifest file resolved by FindManifest.
// project.yaml is a legacy name and is never read.
const ManifestFilename = "devtrack.yaml"

// Manifest represents the contents of a devtrack.yaml file.
type Manifest struct {
	Name        string   `yaml:"name"`
	Workflow    string   `yaml:"workflow"`
	Domain      string   `yaml:"domain"`
	Tags        []string `yaml:"tags"`
	RepoURL    string   `yaml:"repo_url"`
	MainBranch string   `yaml:"main_branch"`
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

// ReadManifest reads and parses the manifest file at the given path.
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

	if m.Workflow == "" {
		m.Workflow = "sdlc"
	} else if m.Workflow != "sdlc" {
		return nil, fmt.Errorf("manifest %q: workflow must be \"sdlc\", got %q", path, m.Workflow)
	}

	return &m, nil
}

// FindManifest walks up the directory tree from the current working directory
// looking for a devtrack.yaml file. It returns the absolute path of the first
// match, or an error if none is found before reaching the filesystem root.
// project.yaml (the legacy manifest name) is never read.
func FindManifest() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("getwd: %w", err)
	}

	for {
		candidate := filepath.Join(dir, ManifestFilename)
		if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
			return candidate, nil
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			// Reached the filesystem root with no match.
			return "", fmt.Errorf("%s not found in %q or any parent directory", ManifestFilename, dir)
		}
		dir = parent
	}
}

// Identity is a project's resolved name and (optional) repo URL.
type Identity struct {
	Name    string
	RepoURL string
}

// ResolveIdentity resolves a project's identity for the repo rooted at dir
// without requiring a manifest to be present. Resolution order:
//  1. dir/devtrack.yaml, if present and valid -> {manifest.Name, manifest.RepoURL}
//  2. else getGitURL(), when it succeeds and returns a non-empty URL ->
//     {name derived from the last path segment of the normalized URL,
//     normalized URL}
//  3. else -> {lowercased folder name, ""}
//
// It never returns an error: a malformed devtrack.yaml (bad YAML, empty name,
// invalid fields) is treated as absent and falls through to the git remote and
// then the folder name, so the identity chain degrades gracefully and an event
// is never dropped for the very file the silent bootstrap invites users to edit
// (RetroLearning #15). The error return is retained for API compatibility with
// existing callers; it is always nil. Write-once bootstrap protection does not
// depend on this error — BootstrapManifest independently refuses to overwrite an
// existing (even corrupt) manifest via its own os.Stat check.
func ResolveIdentity(dir string, getGitURL func() (string, error)) (Identity, error) {
	manifestPath := filepath.Join(dir, ManifestFilename)
	if fi, err := os.Stat(manifestPath); err == nil && !fi.IsDir() {
		// A readable, valid manifest wins. A malformed one falls through to the
		// rest of the chain rather than zeroing the identity.
		if m, err := ReadManifest(manifestPath); err == nil {
			return Identity{Name: m.Name, RepoURL: m.RepoURL}, nil
		}
	}

	if url, err := getGitURL(); err == nil && url != "" {
		normalized := normalizeRepoURL(url)
		return Identity{Name: path.Base(normalized), RepoURL: normalized}, nil
	}

	return Identity{Name: strings.ToLower(filepath.Base(dir)), RepoURL: ""}, nil
}

// BootstrapManifest silently writes dir/devtrack.yaml with the resolved
// identity so future runs (and other tools) resolve the same name/repo_url
// without re-deriving it. It is write-once — an existing manifest is never
// overwritten — and can be disabled entirely by setting
// DEVTRACK_NO_BOOTSTRAP=1. Any write error is returned for the caller to
// swallow; bootstrapping must never block the operation that triggered it.
func BootstrapManifest(dir string, identity Identity) error {
	if os.Getenv("DEVTRACK_NO_BOOTSTRAP") == "1" {
		return nil
	}

	manifestPath := filepath.Join(dir, ManifestFilename)
	if _, err := os.Stat(manifestPath); err == nil {
		return nil
	}

	var b strings.Builder
	b.WriteString("# Written by devtrack — safe to edit or delete.\n")
	b.WriteString("# This file will not be overwritten once it exists.\n")
	b.WriteString("name: " + identity.Name + "\n")
	if identity.RepoURL != "" {
		b.WriteString("repo_url: " + identity.RepoURL + "\n")
	}

	return os.WriteFile(manifestPath, []byte(b.String()), 0o644)
}

// normalizeRepoURL strips trailing slashes and .git suffix for comparison.
func normalizeRepoURL(u string) string {
	u = strings.TrimRight(u, "/")
	u = strings.TrimSuffix(u, ".git")
	return u
}

// FindProjectIDByName returns the ID of the first project in projects whose
// Name field matches name exactly. It returns an empty string when no match
// is found. Matching is case-sensitive.
func FindProjectIDByName(projects []ProjectSummary, name string) string {
	for _, p := range projects {
		if p.Name == name {
			return p.ID
		}
	}
	return ""
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
