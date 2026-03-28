package cmd

import (
	"fmt"
	"io"

	"github.com/spf13/cobra"
)

// Version is injected at build time via ldflags:
//
//	go build -ldflags="-X devtrack/cmd.Version=1.2.3"
var Version = "dev"

func printVersion(w io.Writer) {
	fmt.Fprintln(w, Version)
}

func init() {
	rootCmd.Flags().Bool("version", false, "Print version and exit")
	rootCmd.RunE = func(cmd *cobra.Command, args []string) error {
		if v, _ := cmd.Flags().GetBool("version"); v {
			printVersion(cmd.OutOrStdout())
		}
		return nil
	}
}
