package cmd

import (
	"bytes"
	"encoding/json"
	"io"
	"strings"

	"devtrack/internal/redact"
	"github.com/spf13/cobra"
)

// toolUseHookPayload is the subset of Claude Code's PostToolUse hook JSON that
// the tool_use event needs.
type toolUseHookPayload struct {
	SessionID string `json:"session_id"`
	Cwd       string `json:"cwd"`
	ToolInput struct {
		Command string `json:"command"`
	} `json:"tool_input"`
}

// titleMaxLength caps the summarized tool_use title so timeline/dashboard
// rows stay one readable line. The full redacted command is preserved in
// metadata.command.
const titleMaxLength = 80

// summarizeCommand collapses a shell command into a single-line title:
// newlines and runs of whitespace become single spaces, and the result is
// capped at titleMaxLength runes with an ellipsis. Input must already be
// redacted — truncation happens after masking so a cut can never expose a
// secret that redaction would have caught.
func summarizeCommand(cmd string) string {
	line := strings.Join(strings.Fields(cmd), " ")
	runes := []rune(line)
	if len(runes) <= titleMaxLength {
		return line
	}
	return string(runes[:titleMaxLength-1]) + "…"
}

// runToolUseHook reads a Claude Code PostToolUse payload from stdin and
// records a tool_use event through sendEvent (WI-581) — it never builds its
// own request body or POST, so redaction, identity resolution, and the
// length cap all come from that single enforcement point. The title is a
// single-line summary of the command (whitespace collapsed, capped at
// titleMaxLength) so it reads cleanly in the dashboard; the full redacted
// command travels in metadata.command. Absent, malformed, or command-less
// input exits quietly with no event sent: a hand-run hook or a harness
// change must never produce an empty or garbage row.
func runToolUseHook(stdin io.Reader) error {
	data, err := io.ReadAll(stdin)
	if err != nil || len(bytes.TrimSpace(data)) == 0 {
		return nil
	}

	var p toolUseHookPayload
	if json.Unmarshal(data, &p) != nil {
		return nil
	}

	if strings.TrimSpace(p.ToolInput.Command) == "" {
		return nil
	}

	// Redact before summarizing: metadata bypasses sendEvent's title
	// redaction, and truncating pre-redaction text could slice a secret in
	// a way the masks no longer match.
	redacted := redact.Redact(p.ToolInput.Command)

	return sendEvent("tool_use", summarizeCommand(redacted), map[string]interface{}{
		"session_id": p.SessionID,
		"cwd":        p.Cwd,
		"command":    redacted,
	})
}

var hooksToolUseCmd = &cobra.Command{
	Use:   "tooluse",
	Short: "Record a tool_use event from Claude Code PostToolUse hook JSON on stdin",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runToolUseHook(cmd.InOrStdin())
	},
}

func init() {
	hooksCmd.AddCommand(hooksToolUseCmd)
}
