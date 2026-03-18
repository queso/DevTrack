package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

// gitHookNames lists the git hooks that devtrack installs automatically.
var gitHookNames = []string{
	"post-commit",
	"post-checkout",
	"post-merge",
	"pre-push",
}

const devtrackBlockStart = "# swagger-jack:custom:start devtrack"
const devtrackBlockEnd = "# swagger-jack:custom:end devtrack"

// generateHookScript returns an executable shell script for the named git hook.
// The script calls `devtrack event` with the appropriate event type and wraps
// the devtrack invocation in swagger-jack custom code markers so it can be
// identified and removed cleanly during uninstall.
func generateHookScript(hookName string) string {
	return "#!/bin/sh\n" + buildDevtrackBlock(hookName) + "\n"
}

// installHooks writes devtrack git hook scripts into <repoRoot>/.git/hooks/.
// If a hook file already exists it appends the devtrack block rather than
// overwriting the file so existing custom logic is preserved.
// Returns an error when <repoRoot>/.git/hooks/ does not exist.
func installHooks(repoRoot string, quiet bool) error {
	hooksPath := filepath.Join(repoRoot, ".git", "hooks")

	if _, err := os.Stat(hooksPath); os.IsNotExist(err) {
		return fmt.Errorf("not a git repository: %q has no .git/hooks directory", repoRoot)
	}

	for _, hookName := range gitHookNames {
		if err := installSingleHook(hooksPath, hookName, quiet); err != nil {
			return err
		}
	}
	return nil
}

// installSingleHook writes or appends devtrack content for one named hook.
func installSingleHook(hooksPath, hookName string, quiet bool) error {
	hookPath := filepath.Join(hooksPath, hookName)

	existingContent, err := readFileIfExists(hookPath)
	if err != nil {
		return fmt.Errorf("read hook %q: %w", hookPath, err)
	}

	devtrackBlock := buildDevtrackBlock(hookName)

	var finalContent string
	if existingContent == "" {
		finalContent = generateHookScript(hookName)
	} else if strings.Contains(existingContent, devtrackBlockStart) {
		// Already installed — skip to avoid duplicates.
		if !quiet {
			fmt.Printf("Hook already installed: %s\n", hookPath)
		}
		return nil
	} else {
		// Append devtrack block without replacing existing content.
		finalContent = strings.TrimRight(existingContent, "\n") + "\n" + devtrackBlock + "\n"
	}

	if err := os.WriteFile(hookPath, []byte(finalContent), 0o755); err != nil {
		return fmt.Errorf("write hook %q: %w", hookPath, err)
	}

	if !quiet {
		fmt.Printf("Installed hook: %s\n", hookPath)
	}
	return nil
}

// buildDevtrackBlock returns the devtrack invocation wrapped in markers.
func buildDevtrackBlock(hookName string) string {
	return fmt.Sprintf("%s\ndevtrack event --type %s --message \"%s hook fired\" 2>/dev/null || true\n%s",
		devtrackBlockStart, hookName, hookName, devtrackBlockEnd)
}

// readFileIfExists returns the file contents as a string, or an empty string
// when the file does not exist. Any other error is returned as-is.
func readFileIfExists(path string) (string, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// uninstallHooks removes the devtrack blocks from all managed git hooks under
// <repoRoot>/.git/hooks/. Hook files that only contained the devtrack block
// are deleted entirely; files with other content have only the devtrack block
// stripped.
// Returns an error when <repoRoot>/.git/hooks/ does not exist.
func uninstallHooks(repoRoot string, quiet bool) error {
	hooksPath := filepath.Join(repoRoot, ".git", "hooks")

	if _, err := os.Stat(hooksPath); os.IsNotExist(err) {
		return fmt.Errorf("not a git repository: %q has no .git/hooks directory", repoRoot)
	}

	for _, hookName := range gitHookNames {
		if err := uninstallSingleHook(hooksPath, hookName, quiet); err != nil {
			return err
		}
	}
	return nil
}

// uninstallSingleHook removes the devtrack block from one hook file.
// When the file is entirely devtrack-managed it is deleted.
func uninstallSingleHook(hooksPath, hookName string, quiet bool) error {
	hookPath := filepath.Join(hooksPath, hookName)

	content, err := readFileIfExists(hookPath)
	if err != nil {
		return fmt.Errorf("read hook %q: %w", hookPath, err)
	}
	if content == "" {
		return nil // nothing to do
	}

	stripped := removeDevtrackBlock(content)

	// When nothing meaningful remains after stripping, delete the file.
	if strings.TrimSpace(stripped) == "" || isOnlyBoilerplate(stripped) {
		if err := os.Remove(hookPath); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove hook %q: %w", hookPath, err)
		}
	} else {
		if err := os.WriteFile(hookPath, []byte(stripped), 0o755); err != nil {
			return fmt.Errorf("write hook %q: %w", hookPath, err)
		}
	}

	if !quiet {
		fmt.Printf("Uninstalled hook: %s\n", hookPath)
	}
	return nil
}

// removeDevtrackBlock strips everything between and including the devtrack
// swagger-jack markers from content. If the end marker is missing, only
// the start marker line is removed (safe fallback to avoid data loss).
func removeDevtrackBlock(content string) string {
	lines := strings.Split(content, "\n")
	var result []string
	inBlock := false
	var blockLines []string

	for _, line := range lines {
		if strings.Contains(line, devtrackBlockStart) {
			inBlock = true
			blockLines = nil
			continue
		}
		if strings.Contains(line, devtrackBlockEnd) {
			inBlock = false
			blockLines = nil
			continue
		}
		if inBlock {
			blockLines = append(blockLines, line)
		} else {
			result = append(result, line)
		}
	}

	// If block was never closed, restore captured lines to avoid data loss.
	if inBlock {
		result = append(result, blockLines...)
	}

	return strings.Join(result, "\n")
}

// isOnlyBoilerplate returns true when the content (after trimming) contains no
// meaningful script body — only blank lines or the shebang line. User comments
// are considered meaningful and preserved.
func isOnlyBoilerplate(content string) bool {
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || trimmed == "#!/bin/sh" || trimmed == "#!/bin/bash" {
			continue
		}
		return false
	}
	return true
}

// ---------------------------------------------------------------------------
// Cobra commands
// ---------------------------------------------------------------------------

var hooksCmd = &cobra.Command{
	Use:   "hooks",
	Short: "Manage devtrack git hooks",
}

var hooksInstallCmd = &cobra.Command{
	Use:   "install",
	Short: "Install devtrack git hooks in the current repository",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		quiet, _ := cmd.Root().PersistentFlags().GetBool("quiet")
		repoRoot, err := findGitRoot()
		if err != nil {
			return err
		}
		return installHooks(repoRoot, quiet)
	},
}

var hooksUninstallCmd = &cobra.Command{
	Use:   "uninstall",
	Short: "Remove devtrack git hooks from the current repository",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		quiet, _ := cmd.Root().PersistentFlags().GetBool("quiet")
		repoRoot, err := findGitRoot()
		if err != nil {
			return err
		}
		return uninstallHooks(repoRoot, quiet)
	},
}

// findGitRoot walks up from the current working directory looking for a .git
// directory. Returns an error when no git repository is found.
func findGitRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("getwd: %w", err)
	}

	for {
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("not a git repository (or any parent up to filesystem root)")
		}
		dir = parent
	}
}

func init() {
	rootCmd.AddCommand(hooksCmd)
	hooksCmd.AddCommand(hooksInstallCmd)
	hooksCmd.AddCommand(hooksUninstallCmd)
	rootCmd.PersistentFlags().Bool("quiet", false, "Suppress non-error output")
}
