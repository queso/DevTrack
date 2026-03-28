package cmd

import (
	"bytes"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func TestVersionDefault(t *testing.T) {
	if Version != "dev" {
		t.Errorf("expected default Version to be %q, got %q", "dev", Version)
	}
}

func TestVersionOutputIsSingleCleanLine(t *testing.T) {
	cmd := &cobra.Command{
		Use: "devtrack",
		RunE: func(cmd *cobra.Command, args []string) error {
			return nil
		},
	}
	var buf bytes.Buffer
	cmd.SetOut(&buf)
	printVersion(&buf)

	output := buf.String()
	lines := strings.Split(strings.TrimRight(output, "\n"), "\n")
	if len(lines) != 1 {
		t.Errorf("expected single-line version output, got %d lines: %q", len(lines), output)
	}
	if lines[0] != Version {
		t.Errorf("expected output to be %q, got %q", Version, lines[0])
	}
}
