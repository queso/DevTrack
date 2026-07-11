package cmd

// swagger-jack:custom:start init-command

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"devtrack/internal"

	"github.com/spf13/cobra"
)

// runInit resolves the project identity for the repo rooted at repoRoot and
// writes devtrack.yaml there. Unlike the read-only `event` path (ADR 0001),
// this is an explicit, user-requested provisioning act: an existing manifest
// is left untouched and reported as such (write-once, exit 0); a failed write
// is returned so the caller learns their manifest was NOT created.
func runInit(repoRoot string, getGitURL func() (string, error), out io.Writer) error {
	manifestPath := filepath.Join(repoRoot, internal.ManifestFilename)

	if _, err := os.Stat(manifestPath); err == nil {
		fmt.Fprintf(out, "devtrack.yaml already exists at %s — leaving it untouched\n", manifestPath)
		return nil
	}

	identity, _ := internal.ResolveIdentity(repoRoot, getGitURL)
	if err := internal.BootstrapManifest(repoRoot, identity); err != nil {
		return fmt.Errorf("write %s: %w", manifestPath, err)
	}

	fmt.Fprintf(out, "Wrote %s\n", manifestPath)
	fmt.Fprintf(out, "  name: %s\n", identity.Name)
	if identity.RepoURL != "" {
		fmt.Fprintf(out, "  repo_url: %s\n", identity.RepoURL)
	}
	return nil
}

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Create a devtrack.yaml manifest for the current repository",
	Long:  "Resolves the project identity (git remote or folder name) and writes devtrack.yaml at the git repository root, or the current directory if outside a git repository. Does nothing (exit 0) if a manifest already exists.",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		repoRoot, err := findGitRoot()
		if err != nil {
			// Not inside a git repository (or git unavailable): fall back to cwd.
			repoRoot, err = os.Getwd()
			if err != nil {
				return err
			}
		}
		return runInit(repoRoot, defaultGetGitURL, cmd.OutOrStdout())
	},
}

func init() {
	rootCmd.AddCommand(initCmd)
}

// swagger-jack:custom:end
