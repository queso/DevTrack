package cmd

import (
	"bytes"
	"encoding/json"
	"io"
	"strings"

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

// runToolUseHook reads a Claude Code PostToolUse payload from stdin and
// records a tool_use event through sendEvent (WI-581) — it never builds its
// own request body or POST, so redaction, identity resolution, and the
// length cap all come from that single enforcement point. Absent, malformed,
// or command-less input exits quietly with no event sent: a hand-run hook or
// a harness change must never produce an empty or garbage row.
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

	return sendEvent("tool_use", p.ToolInput.Command, map[string]interface{}{
		"session_id": p.SessionID,
		"cwd":        p.Cwd,
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
