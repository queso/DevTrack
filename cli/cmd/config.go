package cmd

import (
	"fmt"

	"devtrack/internal"

	"github.com/spf13/cobra"
)

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Manage devtrack configuration",
}

var configSetCmd = &cobra.Command{
	Use:   "set <key> <value>",
	Short: "Set a configuration value",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfgPath := configPath(cmd)
		cfg, err := internal.LoadConfig(cfgPath)
		if err != nil {
			return err
		}
		if err := internal.SetConfigValue(&cfg, args[0], args[1]); err != nil {
			return err
		}
		return internal.SaveConfig(cfgPath, cfg)
	},
}

var configGetCmd = &cobra.Command{
	Use:   "get <key>",
	Short: "Get a configuration value",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cfgPath := configPath(cmd)
		cfg, err := internal.LoadConfig(cfgPath)
		if err != nil {
			return err
		}
		val, err := internal.GetConfigValue(cfg, args[0])
		if err != nil {
			return err
		}
		fmt.Fprintln(cmd.OutOrStdout(), val)
		return nil
	},
}

var configListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all configuration values",
	Args:  cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfgPath := configPath(cmd)
		cfg, err := internal.LoadConfig(cfgPath)
		if err != nil {
			return err
		}
		w := cmd.OutOrStdout()
		fmt.Fprintf(w, "api_url=%s\n", cfg.APIUrl)
		fmt.Fprintf(w, "token=%s\n", cfg.Token)
		return nil
	},
}

func configPath(cmd *cobra.Command) string {
	p, _ := cmd.Root().PersistentFlags().GetString("config")
	if p != "" {
		return p
	}
	return internal.DefaultConfigPath()
}

func init() {
	rootCmd.AddCommand(configCmd)
	configCmd.AddCommand(configSetCmd)
	configCmd.AddCommand(configGetCmd)
	configCmd.AddCommand(configListCmd)
}
