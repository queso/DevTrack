package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

// httpNewRequest is a thin wrapper so tests can stay focused on behavior.
var httpNewRequest = http.NewRequest

// httpDefaultClient is the shared HTTP client for health checks.
var httpDefaultClient = &http.Client{}

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
		// Already installed — strip the old managed block and append a fresh
		// one so re-running the installer upgrades the block in place
		// (exactly one block, no duplication) instead of leaving a stale one
		// behind. Non-devtrack content is preserved.
		stripped := strings.TrimRight(removeDevtrackBlock(existingContent), "\n")
		finalContent = stripped + "\n" + devtrackBlock + "\n"
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

// hookEventType maps a git hook name to the DevTrack API event type it
// reports. The raw git-hook name (e.g. "post-commit") is never a valid API
// event type and must never be forwarded as --type.
func hookEventType(hookName string) string {
	switch hookName {
	case "post-commit":
		return "commit"
	case "pre-push":
		return "push"
	case "post-checkout":
		return "checkout"
	case "post-merge":
		return "merge"
	default:
		return hookName
	}
}

// buildDevtrackBlock returns the devtrack invocation wrapped in markers. It
// maps hookName to a valid API event type and gathers the relevant git data
// as metadata — the commit subject and hash for post-commit, the current
// branch for the others. No --project-yaml is passed: sendEvent resolves
// project identity from the working directory (WI-579/WI-581).
func buildDevtrackBlock(hookName string) string {
	eventType := hookEventType(hookName)

	if hookName == "post-commit" {
		message := `$(git log -1 --pretty=%s)`
		metadata := `{\"hash\":\"$(git rev-parse HEAD)\"}`
		return devtrackBlockStart + "\n" +
			`devtrack event --type ` + eventType + ` --message "` + message + `" --metadata "` + metadata + `" --quiet 2>/dev/null || true` + "\n" +
			devtrackBlockEnd
	}

	// The branch name is attacker/user-controlled shell output: double quotes
	// are legal in git ref names (backslashes and control chars are not), so
	// it cannot be interpolated directly into the JSON string literal below.
	// Capture it into a variable through a JSON-escaping sed pass first (POSIX
	// sh safe — no bash ${var//} expansions, since git hooks may run under
	// /bin/sh), then interpolate the escaped variable.
	message := hookName + " hook fired"
	return devtrackBlockStart + "\n" +
		`_devtrack_branch=$(git rev-parse --abbrev-ref HEAD | sed 's/\\/\\\\/g; s/"/\\"/g')` + "\n" +
		`devtrack event --type ` + eventType + ` --message "` + message + `" --metadata "{\"branch\":\"$_devtrack_branch\"}" --quiet 2>/dev/null || true` + "\n" +
		devtrackBlockEnd
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
// Claude Code hooks
// ---------------------------------------------------------------------------

// claudeCodeHookMarker is the string we look for to identify devtrack-managed
// hooks inside ~/.claude/settings.json. Matches both "devtrack event ..." and
// "devtrack hooks tooluse ..." invocations.
const claudeCodeHookMarker = "devtrack "

// claudeCodeHookDef describes a single Claude Code hook entry.
type claudeCodeHookDef struct {
	Event   string
	Matcher string
	Command string
}

// claudeCodeHooks is the set of hooks we install into Claude Code settings.
var claudeCodeHooks = []claudeCodeHookDef{
	{
		Event:   "PostToolUse",
		Matcher: "Bash",
		Command: `devtrack hooks tooluse 2>/dev/null || true`,
	},
	{
		Event:   "SessionStart",
		Matcher: "",
		Command: `devtrack event --type session-start --quiet 2>/dev/null || true`,
	},
	{
		Event:   "SessionEnd",
		Matcher: "",
		Command: `devtrack event --type session-end --quiet 2>/dev/null || true`,
	},
	{
		// Claude Code's Stop hook fires once per response turn, not once per
		// session, so it records turn_end. Real session ends come from the
		// SessionEnd hook above.
		Event:   "Stop",
		Matcher: "",
		Command: `devtrack event --type turn-end --quiet 2>/dev/null || true`,
	},
}

// defaultClaudeSettingsPath returns ~/.claude/settings.json.
func defaultClaudeSettingsPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join("~", ".claude", "settings.json")
	}
	return filepath.Join(home, ".claude", "settings.json")
}

// isDevtrackManagedEntry reports whether a top-level hooks[event] array entry
// was written by devtrack, in either the legacy flat shape (command directly
// on the entry — the pre-issue-#14 bug) or the current nested shape (command
// inside the entry's "hooks" array). Used to find-and-replace devtrack's own
// entries on install/uninstall without touching other tools' entries.
func isDevtrackManagedEntry(entry interface{}) bool {
	entryMap, ok := entry.(map[string]interface{})
	if !ok {
		return false
	}
	if cmd, ok := entryMap["command"].(string); ok && strings.Contains(cmd, claudeCodeHookMarker) {
		return true
	}
	if innerHooks, ok := entryMap["hooks"].([]interface{}); ok {
		for _, h := range innerHooks {
			if hMap, ok := h.(map[string]interface{}); ok {
				if cmd, ok := hMap["command"].(string); ok && strings.Contains(cmd, claudeCodeHookMarker) {
					return true
				}
			}
		}
	}
	return false
}

// installClaudeCodeHooks adds devtrack hooks to the Claude Code settings file.
func installClaudeCodeHooks(settingsPath string, quiet bool) error {
	data, err := os.ReadFile(settingsPath)
	if os.IsNotExist(err) {
		data = []byte("{}")
	} else if err != nil {
		return fmt.Errorf("read claude settings: %w", err)
	}

	var settings map[string]interface{}
	if err := json.Unmarshal(data, &settings); err != nil {
		return fmt.Errorf("parse claude settings: %w", err)
	}

	hooksRaw, ok := settings["hooks"]
	if !ok {
		hooksRaw = map[string]interface{}{}
	}
	hooks, ok := hooksRaw.(map[string]interface{})
	if !ok {
		hooks = map[string]interface{}{}
	}

	for _, def := range claudeCodeHooks {
		eventKey := def.Event

		var existing []interface{}
		if arr, ok := hooks[eventKey]; ok {
			if typedArr, ok := arr.([]interface{}); ok {
				existing = typedArr
			}
		}

		// Strip any devtrack-managed entry for this event — whether left over
		// from the pre-issue-#14 flat shape or a previous nested install — so
		// re-running the installer upgrades the entry in place instead of
		// duplicating it. Every devtrack-owned group is dedicated to devtrack
		// alone, so whole-group removal here is safe; other tools' groups are
		// left untouched.
		var kept []interface{}
		for _, entry := range existing {
			if isDevtrackManagedEntry(entry) {
				continue
			}
			kept = append(kept, entry)
		}

		// Claude Code requires each matcher-group entry to nest its command(s)
		// inside a "hooks" array; a flat {"command":...} object on the group
		// itself is rejected (issue #14), taking the whole settings.json with it.
		newGroup := map[string]interface{}{
			"hooks": []interface{}{
				map[string]interface{}{
					"type":    "command",
					"command": def.Command,
				},
			},
		}
		if def.Matcher != "" {
			newGroup["matcher"] = def.Matcher
		}

		hooks[eventKey] = append(kept, newGroup)

		if !quiet {
			fmt.Printf("Installed Claude Code hook: %s\n", eventKey)
		}
	}

	settings["hooks"] = hooks

	// Create directory if needed
	dir := filepath.Dir(settingsPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create claude settings dir: %w", err)
	}

	out, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal claude settings: %w", err)
	}

	if err := os.WriteFile(settingsPath, append(out, '\n'), 0o644); err != nil {
		return fmt.Errorf("write claude settings: %w", err)
	}

	return nil
}

// uninstallClaudeCodeHooks removes devtrack hooks from Claude Code settings.
func uninstallClaudeCodeHooks(settingsPath string, quiet bool) error {
	data, err := os.ReadFile(settingsPath)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read claude settings: %w", err)
	}

	var settings map[string]interface{}
	if err := json.Unmarshal(data, &settings); err != nil {
		return fmt.Errorf("parse claude settings: %w", err)
	}

	hooksRaw, ok := settings["hooks"]
	if !ok {
		return nil
	}
	hooks, ok := hooksRaw.(map[string]interface{})
	if !ok {
		return nil
	}

	for _, def := range claudeCodeHooks {
		eventKey := def.Event
		arr, ok := hooks[eventKey]
		if !ok {
			continue
		}
		typedArr, ok := arr.([]interface{})
		if !ok {
			continue
		}

		var filteredGroups []interface{}
		for _, entry := range typedArr {
			entryMap, ok := entry.(map[string]interface{})
			if !ok {
				// Not an object we understand — leave it untouched.
				filteredGroups = append(filteredGroups, entry)
				continue
			}

			innerHooks, ok := entryMap["hooks"].([]interface{})
			if !ok {
				// Legacy flat shape: the whole entry is devtrack's own command,
				// or an object we don't recognize — drop only if it's ours.
				if isDevtrackManagedEntry(entry) {
					continue
				}
				filteredGroups = append(filteredGroups, entry)
				continue
			}

			// Nested shape: filter devtrack's command(s) out of this group's
			// inner hooks array, preserving any other tools' entries in the
			// same group. Drop the whole group only once it's left empty.
			var filteredInner []interface{}
			for _, h := range innerHooks {
				if hMap, ok := h.(map[string]interface{}); ok {
					if cmd, ok := hMap["command"].(string); ok && strings.Contains(cmd, claudeCodeHookMarker) {
						continue
					}
				}
				filteredInner = append(filteredInner, h)
			}

			if len(filteredInner) == 0 {
				continue // group was entirely devtrack's — drop it
			}
			entryMap["hooks"] = filteredInner
			filteredGroups = append(filteredGroups, entryMap)
		}

		if len(filteredGroups) == 0 {
			delete(hooks, eventKey)
		} else {
			hooks[eventKey] = filteredGroups
		}

		if !quiet {
			fmt.Printf("Uninstalled Claude Code hook: %s\n", eventKey)
		}
	}

	// Remove hooks key if empty
	if len(hooks) == 0 {
		delete(settings, "hooks")
	} else {
		settings["hooks"] = hooks
	}

	out, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal claude settings: %w", err)
	}

	if err := os.WriteFile(settingsPath, append(out, '\n'), 0o644); err != nil {
		return fmt.Errorf("write claude settings: %w", err)
	}

	return nil
}

// ---------------------------------------------------------------------------
// WI-006: hooks test subcommand
// ---------------------------------------------------------------------------

// runHooksTest checks whether git hooks, Claude Code hooks, and the API are
// all operational. It writes a status report to out and returns a non-nil error
// when any critical check fails (no hooks installed, or API unreachable).
func runHooksTest(repoRoot string, settingsPath string, checkHealth func() error, out io.Writer) error {
	hooksPath := filepath.Join(repoRoot, ".git", "hooks")

	// Check git hooks.
	gitInstalled := 0
	for _, hookName := range gitHookNames {
		hookFile := filepath.Join(hooksPath, hookName)
		content, err := readFileIfExists(hookFile)
		if err != nil || content == "" || !strings.Contains(content, devtrackBlockStart) {
			fmt.Fprintf(out, "  [✗] git hook missing: %s\n", hookName)
		} else {
			fmt.Fprintf(out, "  [✓] git hook installed: %s\n", hookName)
			gitInstalled++
		}
	}

	// Check Claude Code hooks.
	claudeInstalled := countClaudeHooks(settingsPath)
	if claudeInstalled > 0 {
		fmt.Fprintf(out, "  [✓] Claude Code hooks installed (%d)\n", claudeInstalled)
	} else {
		fmt.Fprintf(out, "  [✗] Claude Code hooks not installed\n")
	}

	// Check API reachability.
	if apiErr := checkHealth(); apiErr != nil {
		fmt.Fprintf(out, "  [✗] API unreachable: %v\n", apiErr)
		return fmt.Errorf("API health check failed: %w", apiErr)
	}
	fmt.Fprintf(out, "  [✓] API reachable\n")

	// Fail when nothing at all is installed.
	if gitInstalled == 0 && claudeInstalled == 0 {
		return fmt.Errorf("no hooks installed: run `devtrack hooks install`")
	}

	return nil
}

// countClaudeHooks reads settingsPath and returns the number of devtrack-managed
// Claude Code hook entries found. Returns 0 when the file does not exist or
// contains no devtrack hooks.
func countClaudeHooks(settingsPath string) int {
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		return 0
	}
	var settings map[string]interface{}
	if json.Unmarshal(data, &settings) != nil {
		return 0
	}
	hooksRaw, ok := settings["hooks"]
	if !ok {
		return 0
	}
	hooks, ok := hooksRaw.(map[string]interface{})
	if !ok {
		return 0
	}
	count := 0
	for _, arr := range hooks {
		typedArr, ok := arr.([]interface{})
		if !ok {
			continue
		}
		for _, entry := range typedArr {
			entryMap, ok := entry.(map[string]interface{})
			if !ok {
				continue
			}
			// Legacy flat shape: command directly on the group entry.
			if cmd, ok := entryMap["command"].(string); ok && strings.Contains(cmd, claudeCodeHookMarker) {
				count++
				continue
			}
			// Current nested shape: command(s) inside the group's "hooks" array.
			if innerHooks, ok := entryMap["hooks"].([]interface{}); ok {
				for _, h := range innerHooks {
					if hMap, ok := h.(map[string]interface{}); ok {
						if cmd, ok := hMap["command"].(string); ok && strings.Contains(cmd, claudeCodeHookMarker) {
							count++
						}
					}
				}
			}
		}
	}
	return count
}

// defaultCheckHealth performs a GET /api/health request to verify the API is up.
func defaultCheckHealth(baseURL, token string) func() error {
	return func() error {
		url := strings.TrimRight(baseURL, "/") + "/api/health"
		req, err := httpNewRequest("GET", url, nil)
		if err != nil {
			return fmt.Errorf("build health request: %w", err)
		}
		if token != "" {
			req.Header.Set("X-Api-Key", token)
		}
		resp, err := httpDefaultClient.Do(req)
		if err != nil {
			return fmt.Errorf("API unreachable: %w", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			return fmt.Errorf("API returned status %d", resp.StatusCode)
		}
		return nil
	}
}

// ---------------------------------------------------------------------------
// Cobra commands
// ---------------------------------------------------------------------------

var hooksCmd = &cobra.Command{
	Use:   "hooks",
	Short: "Manage devtrack hooks",
}

var hooksInstallCmd = &cobra.Command{
	Use:   "install",
	Short: "Install devtrack hooks",
	Long: "Install devtrack git hooks into the current repository.\n\n" +
		"By default only git hooks are installed: the DevTrack Claude Code plugin " +
		"ships its own session/tool-use hooks (SessionStart, SessionEnd, Stop, " +
		"PostToolUse), so installing them again here would double-record every " +
		"event. Pass --claude-code to also write Claude Code hooks into " +
		"~/.claude/settings.json (for CLI-only setups without the plugin).",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		quiet, _ := cmd.Root().PersistentFlags().GetBool("quiet")
		gitOnly, _ := cmd.Flags().GetBool("git")
		claudeOnly, _ := cmd.Flags().GetBool("claude-code")

		// Git hooks install by default. Claude Code hooks are opt-in via
		// --claude-code, because the plugin already provides them; --git is
		// retained for explicitness/back-compat and means the same as the
		// default. Passing both flags installs both.
		installGit := gitOnly || !claudeOnly
		installClaude := claudeOnly

		if installGit {
			repoRoot, err := findGitRoot()
			if err != nil {
				return err
			}
			if err := installHooks(repoRoot, quiet); err != nil {
				return err
			}
		}

		if installClaude {
			settingsPath := defaultClaudeSettingsPath()
			if err := installClaudeCodeHooks(settingsPath, quiet); err != nil {
				return err
			}
		}

		return nil
	},
}

var hooksUninstallCmd = &cobra.Command{
	Use:   "uninstall",
	Short: "Remove devtrack hooks",
	Long:  "Remove devtrack hooks. By default removes both git hooks and Claude Code hooks. Use --git or --claude-code to remove only one type.",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		quiet, _ := cmd.Root().PersistentFlags().GetBool("quiet")
		gitOnly, _ := cmd.Flags().GetBool("git")
		claudeOnly, _ := cmd.Flags().GetBool("claude-code")

		// Default: uninstall both
		uninstallGit := !claudeOnly || gitOnly
		uninstallClaude := !gitOnly || claudeOnly

		if gitOnly && claudeOnly {
			uninstallGit = true
			uninstallClaude = true
		}

		if uninstallGit {
			repoRoot, err := findGitRoot()
			if err != nil {
				return err
			}
			if err := uninstallHooks(repoRoot, quiet); err != nil {
				return err
			}
		}

		if uninstallClaude {
			settingsPath := defaultClaudeSettingsPath()
			if err := uninstallClaudeCodeHooks(settingsPath, quiet); err != nil {
				return err
			}
		}

		return nil
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

var hooksTestCmd = &cobra.Command{
	Use:   "test",
	Short: "Verify hooks are installed and API is reachable",
	Long:  "Checks that all git hooks and Claude Code hooks are installed and that the DevTrack API is reachable.",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		repoRoot, err := findGitRoot()
		if err != nil {
			return err
		}
		settingsPath := defaultClaudeSettingsPath()
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		return runHooksTest(repoRoot, settingsPath, defaultCheckHealth(baseURL, token), cmd.OutOrStdout())
	},
}

func init() {
	rootCmd.AddCommand(hooksCmd)
	hooksCmd.AddCommand(hooksInstallCmd)
	hooksCmd.AddCommand(hooksUninstallCmd)
	hooksCmd.AddCommand(hooksTestCmd)
	hooksInstallCmd.Flags().Bool("git", false, "Install git hooks only")
	hooksInstallCmd.Flags().Bool("claude-code", false, "Install Claude Code hooks only")
	hooksUninstallCmd.Flags().Bool("git", false, "Uninstall git hooks only")
	hooksUninstallCmd.Flags().Bool("claude-code", false, "Uninstall Claude Code hooks only")
	rootCmd.PersistentFlags().Bool("quiet", false, "Suppress non-error output")
}
