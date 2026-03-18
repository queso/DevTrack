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
	projectsCreateBranchCmdBody string
	projectsCreateBranchCmdBodyFile string
	projectsCreateBranchCmd_isActive bool
	projectsCreateBranchCmd_name string
	projectsCreateBranchCmd_prdId string
	projectsCreateBranchCmd_projectId string
)

var projectsCreateBranchCmd = &cobra.Command{
	Use: "createBranch <id>",
	Short: "Register a branch",
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		pathParams["id"] = args[0]
		queryParams := map[string]string{}
		if projectsCreateBranchCmdBodyFile != "" {
			fileData, err := os.ReadFile(projectsCreateBranchCmdBodyFile)
			if err != nil {
				return fmt.Errorf("reading body-file: %w", err)
			}
			if !json.Valid(fileData) {
				return fmt.Errorf("body-file does not contain valid JSON")
			}
			projectsCreateBranchCmdBody = string(fileData)
		}
		if projectsCreateBranchCmdBody != "" {
			if !json.Valid([]byte(projectsCreateBranchCmdBody)) {
				return fmt.Errorf("--body does not contain valid JSON")
			}
			var bodyObj interface{}
			_ = json.Unmarshal([]byte(projectsCreateBranchCmdBody), &bodyObj)
			resp, err := c.Do("POST", "/projects/{id}/branches", pathParams, queryParams, bodyObj)
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
		bodyMap := map[string]interface{}{}
		bodyMap["is_active"] = projectsCreateBranchCmd_isActive
		bodyMap["name"] = projectsCreateBranchCmd_name
		bodyMap["prd_id"] = projectsCreateBranchCmd_prdId
		bodyMap["project_id"] = projectsCreateBranchCmd_projectId
		resp, err := c.Do("POST", "/projects/{id}/branches", pathParams, queryParams, bodyMap)
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
	projectsCmd.AddCommand(projectsCreateBranchCmd)
	projectsCreateBranchCmd.Flags().StringVar(&projectsCreateBranchCmdBody, "body", "", "Raw JSON body (overrides individual flags)")
	projectsCreateBranchCmd.Flags().StringVar(&projectsCreateBranchCmdBodyFile, "body-file", "", "Path to JSON file to use as request body")
	projectsCreateBranchCmd.Flags().BoolVar(&projectsCreateBranchCmd_isActive, "is_active", false, "")
	projectsCreateBranchCmd.Flags().StringVar(&projectsCreateBranchCmd_name, "name", "", "")
	projectsCreateBranchCmd.Flags().StringVar(&projectsCreateBranchCmd_prdId, "prd_id", "", "")
	projectsCreateBranchCmd.Flags().StringVar(&projectsCreateBranchCmd_projectId, "project_id", "", "")
	projectsCreateBranchCmd.MarkFlagRequired("name")
	projectsCreateBranchCmd.MarkFlagRequired("project_id")
}
