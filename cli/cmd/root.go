package cmd

import (
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

		if os.Getenv("DEVTRACK_TOKEN") == "" && cfg.Token != "" {
			os.Setenv("DEVTRACK_TOKEN", cfg.Token)
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
