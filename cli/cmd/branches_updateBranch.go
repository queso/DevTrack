package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"github.com/spf13/cobra"
	"devtrack/internal/client"
	"devtrack/internal/output"
)

var (
	branchesUpdateBranchCmdBody string
	branchesUpdateBranchCmdBodyFile string
)

var branchesUpdateBranchCmd = &cobra.Command{
	Use: "updateBranch <id>",
	Short: "Update a branch",
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		pathParams["id"] = args[0]
		queryParams := map[string]string{}
		if branchesUpdateBranchCmdBodyFile != "" {
			fileData, err := os.ReadFile(branchesUpdateBranchCmdBodyFile)
			if err != nil {
				return fmt.Errorf("reading body-file: %w", err)
			}
			if !json.Valid(fileData) {
				return fmt.Errorf("body-file does not contain valid JSON")
			}
			branchesUpdateBranchCmdBody = string(fileData)
		}
		if branchesUpdateBranchCmdBody != "" {
			if !json.Valid([]byte(branchesUpdateBranchCmdBody)) {
				return fmt.Errorf("--body does not contain valid JSON")
			}
			var bodyObj interface{}
			_ = json.Unmarshal([]byte(branchesUpdateBranchCmdBody), &bodyObj)
			resp, err := c.Do("PATCH", "/branches/{id}", pathParams, queryParams, bodyObj)
			if err != nil {
				return err
			}
			jsonMode, _ := cmd.Root().PersistentFlags().GetBool("json")
			noColor, _ := cmd.Root().PersistentFlags().GetBool("no-color")
			if jsonMode {
				fmt.Printf("%s\n", string(resp))
			} else {
				if err := output.PrintTable(resp, noColor); err != nil {
					fmt.Println(string(resp))
				}
			}
			return nil
		}
		resp, err := c.Do("PATCH", "/branches/{id}", pathParams, queryParams, nil)
		if err != nil {
			return err
		}
		jsonMode, _ := cmd.Root().PersistentFlags().GetBool("json")
		noColor, _ := cmd.Root().PersistentFlags().GetBool("no-color")
		if jsonMode {
			fmt.Printf("%s\n", string(resp))
		} else {
			if err := output.PrintTable(resp, noColor); err != nil {
				fmt.Println(string(resp))
			}
		}
		return nil
	},
}

func init() {
	branchesCmd.AddCommand(branchesUpdateBranchCmd)
	branchesUpdateBranchCmd.Flags().StringVar(&branchesUpdateBranchCmdBody, "body", "", "Raw JSON body (overrides individual flags)")
	branchesUpdateBranchCmd.Flags().StringVar(&branchesUpdateBranchCmdBodyFile, "body-file", "", "Path to JSON file to use as request body")
}
