package cmd

// issue #16 / ADR 0001: `devtrack init` is the explicit provisioning command
// that replaces the old silent bootstrap. Contract:
//
//	func runInit(repoRoot string, getGitURL func() (string, error), out io.Writer) error
//
// It resolves identity for repoRoot (internal.ResolveIdentity) and writes
// devtrack.yaml there (internal.BootstrapManifest). Unlike the read-only
// event path, this write is user-requested: an existing manifest is left
// untouched and reported (exit 0); a failed write is returned loudly.

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"devtrack/internal"
)

func gitURLStub(url string) func() (string, error) {
	return func() (string, error) { return url, nil }
}

func noGitRemote() (string, error) {
	return "", errors.New("no remote origin")
}

// init creates devtrack.yaml with the derived name/repo_url at the repo root.
func TestInit_CreatesManifestWithDerivedIdentity(t *testing.T) {
	dir := t.TempDir()

	var out bytes.Buffer
	if err := runInit(dir, gitURLStub("https://github.com/acme/widgets.git"), &out); err != nil {
		t.Fatalf("runInit: %v", err)
	}

	manifestPath := filepath.Join(dir, internal.ManifestFilename)
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("expected devtrack.yaml to be written: %v", err)
	}
	if !strings.Contains(string(data), "name: widgets") {
		t.Errorf("manifest missing derived name, got:\n%s", data)
	}
	if !strings.Contains(string(data), "repo_url: https://github.com/acme/widgets") {
		t.Errorf("manifest missing derived repo_url, got:\n%s", data)
	}

	// Prints what it wrote: path, name, repo_url.
	printed := out.String()
	if !strings.Contains(printed, manifestPath) {
		t.Errorf("expected output to mention the written path %q, got: %q", manifestPath, printed)
	}
	if !strings.Contains(printed, "widgets") {
		t.Errorf("expected output to mention the derived name, got: %q", printed)
	}
	if !strings.Contains(printed, "https://github.com/acme/widgets") {
		t.Errorf("expected output to mention the derived repo_url, got: %q", printed)
	}
}

// A second run leaves the file byte-identical and exits 0 (write-once).
func TestInit_SecondRunLeavesFileByteIdenticalAndExitsZero(t *testing.T) {
	dir := t.TempDir()

	var out bytes.Buffer
	if err := runInit(dir, gitURLStub("https://github.com/acme/widgets.git"), &out); err != nil {
		t.Fatalf("first runInit: %v", err)
	}
	manifestPath := filepath.Join(dir, internal.ManifestFilename)
	before, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	out.Reset()
	// A different identity: if the second run overwrote, this would leak in.
	if err := runInit(dir, gitURLStub("https://github.com/other/other.git"), &out); err != nil {
		t.Fatalf("second runInit returned an error, want exit 0: %v", err)
	}

	after, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if !bytes.Equal(before, after) {
		t.Errorf("second run modified the manifest — write-once violated:\nbefore:\n%s\nafter:\n%s", before, after)
	}
	if !strings.Contains(out.String(), "already exists") {
		t.Errorf("expected second run to report the manifest already exists, got: %q", out.String())
	}
}

// A write failure (unwritable/missing target directory) is returned loudly —
// unlike the old silent path, the user asked for this write and must know it failed.
func TestInit_WriteFailureReturnsErrorLoudly(t *testing.T) {
	missingDir := filepath.Join(t.TempDir(), "does-not-exist")

	var out bytes.Buffer
	err := runInit(missingDir, noGitRemote, &out)
	if err == nil {
		t.Fatal("expected an error when the manifest write fails, got nil")
	}
}

// The written manifest round-trips through ResolveIdentity.
func TestInit_WrittenManifestRoundTripsThroughResolveIdentity(t *testing.T) {
	dir := t.TempDir()

	var out bytes.Buffer
	if err := runInit(dir, gitURLStub("https://github.com/acme/widgets.git"), &out); err != nil {
		t.Fatalf("runInit: %v", err)
	}

	id, err := internal.ResolveIdentity(dir, noGitRemote)
	if err != nil {
		t.Fatalf("ResolveIdentity: %v", err)
	}
	if id.Name != "widgets" {
		t.Errorf("Name: got %q, want %q", id.Name, "widgets")
	}
	if id.RepoURL != "https://github.com/acme/widgets" {
		t.Errorf("RepoURL: got %q, want %q", id.RepoURL, "https://github.com/acme/widgets")
	}
}

// init is registered on rootCmd.
func TestInitCmd_Registered(t *testing.T) {
	found := false
	for _, sub := range rootCmd.Commands() {
		if sub.Name() == "init" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected 'init' command to be registered on rootCmd, but it was not found")
	}
}
