package cmd

import (
	"fmt"
	"os"

	"devtrack/internal"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "devtrack",
	Short: "DevTrack API",
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		cfgPath := configPath(cmd)
		cfg, err := internal.LoadConfig(cfgPath)
		if err != nil {
			return err
		}

		if !cmd.Flags().Changed("base-url") {
			if envURL := os.Getenv("DEVTRACK_API_URL"); envURL != "" {
				cmd.Root().PersistentFlags().Set("base-url", envURL)
			} else if cfg.APIUrl != "" {
				cmd.Root().PersistentFlags().Set("base-url", cfg.APIUrl)
			}
		}

		// Resolve the API key. DEVTRACK_API_KEY is the canonical name (it matches
		// the server env var and all docs); DEVTRACK_TOKEN is the legacy name kept
		// for backward compatibility. Downstream commands read
		// os.Getenv("DEVTRACK_TOKEN"), so normalize the resolved key into it.
		if apiKey := os.Getenv("DEVTRACK_API_KEY"); apiKey != "" {
			os.Setenv("DEVTRACK_TOKEN", apiKey)
		} else if os.Getenv("DEVTRACK_TOKEN") != "" {
			fmt.Fprintln(os.Stderr, "devtrack: warning: DEVTRACK_TOKEN is deprecated; set DEVTRACK_API_KEY instead")
		} else if cfg.Token != "" {
			os.Setenv("DEVTRACK_TOKEN", cfg.Token)
		}

		// Resolve the Cloudflare Access service-token creds the same way:
		// env wins, config file fills the gap. client.NewClient reads these
		// env vars, so normalizing here keeps that single construction point
		// unchanged while letting hooks run in env-less contexts (cron,
		// stale shells, launchers) with only ~/.devtrack/config.yaml.
		if os.Getenv("ACCESS_CLIENT_ID") == "" && cfg.AccessClientID != "" {
			os.Setenv("ACCESS_CLIENT_ID", cfg.AccessClientID)
		}
		if os.Getenv("ACCESS_CLIENT_SECRET") == "" && cfg.AccessClientSecret != "" {
			os.Setenv("ACCESS_CLIENT_SECRET", cfg.AccessClientSecret)
		}

		return nil
	},
}

// Execute is the conventional cobra entry point called from main.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().Bool("json", false, "Output raw JSON")
	rootCmd.PersistentFlags().Bool("verbose", false, "Verbose output")
	rootCmd.PersistentFlags().String("config", "", "Config file path")
	rootCmd.PersistentFlags().String("base-url", "/api/v1", "API base URL")
	rootCmd.PersistentFlags().Bool("no-color", false, "Disable color output")
	// swagger-jack:custom:start init-hook
	// swagger-jack:custom:end
}
