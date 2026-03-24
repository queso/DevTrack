package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"github.com/spf13/cobra"
	"devtrack/internal/client"
	"devtrack/internal/output"
	"devtrack/internal/validate"
)

var (
	projectsCreateProjectCmdBody string
	projectsCreateProjectCmdBodyFile string
	projectsCreateProjectCmd_deployUrl string
	projectsCreateProjectCmd_mainBranch string
	projectsCreateProjectCmd_deployEnvironment string
	projectsCreateProjectCmd_deployHealthCheck string
	projectsCreateProjectCmd_domain string
	projectsCreateProjectCmd_testPattern string
	projectsCreateProjectCmd_branchPrefix string
	projectsCreateProjectCmd_name string
	projectsCreateProjectCmd_owner string
	projectsCreateProjectCmd_prdPath string
	projectsCreateProjectCmd_workflow string
	projectsCreateProjectCmd_repoUrl string
	projectsCreateProjectCmd_tags []string
)

var projectsCreateProjectCmd = &cobra.Command{
	Use: "createProject",
	Short: "Create a project",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		queryParams := map[string]string{}
		if err := validate.Enum("workflow", projectsCreateProjectCmd_workflow, []string{"sdlc"}); err != nil { return err }
		if projectsCreateProjectCmdBodyFile != "" {
			fileData, err := os.ReadFile(projectsCreateProjectCmdBodyFile)
			if err != nil {
				return fmt.Errorf("reading body-file: %w", err)
			}
			if !json.Valid(fileData) {
				return fmt.Errorf("body-file does not contain valid JSON")
			}
			projectsCreateProjectCmdBody = string(fileData)
		}
		if projectsCreateProjectCmdBody != "" {
			if !json.Valid([]byte(projectsCreateProjectCmdBody)) {
				return fmt.Errorf("--body does not contain valid JSON")
			}
			var bodyObj interface{}
			_ = json.Unmarshal([]byte(projectsCreateProjectCmdBody), &bodyObj)
			resp, err := c.Do("POST", "/projects", pathParams, queryParams, bodyObj)
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
		bodyMap["deploy_url"] = projectsCreateProjectCmd_deployUrl
		bodyMap["main_branch"] = projectsCreateProjectCmd_mainBranch
		bodyMap["deploy_environment"] = projectsCreateProjectCmd_deployEnvironment
		bodyMap["deploy_health_check"] = projectsCreateProjectCmd_deployHealthCheck
		bodyMap["domain"] = projectsCreateProjectCmd_domain
		bodyMap["test_pattern"] = projectsCreateProjectCmd_testPattern
		bodyMap["branch_prefix"] = projectsCreateProjectCmd_branchPrefix
		bodyMap["name"] = projectsCreateProjectCmd_name
		bodyMap["owner"] = projectsCreateProjectCmd_owner
		bodyMap["prd_path"] = projectsCreateProjectCmd_prdPath
		bodyMap["workflow"] = projectsCreateProjectCmd_workflow
		bodyMap["repo_url"] = projectsCreateProjectCmd_repoUrl
		bodyMap["tags"] = projectsCreateProjectCmd_tags
		resp, err := c.Do("POST", "/projects", pathParams, queryParams, bodyMap)
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
	projectsCmd.AddCommand(projectsCreateProjectCmd)
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmdBody, "body", "", "Raw JSON body (overrides individual flags)")
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmdBodyFile, "body-file", "", "Path to JSON file to use as request body")
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmd_deployUrl, "deploy_url", "", "")
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmd_mainBranch, "main_branch", "", "")
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmd_deployEnvironment, "deploy_environment", "", "")
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmd_deployHealthCheck, "deploy_health_check", "", "")
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmd_domain, "domain", "", "")
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmd_testPattern, "test_pattern", "", "")
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmd_branchPrefix, "branch_prefix", "", "")
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmd_name, "name", "", "")
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmd_owner, "owner", "", "")
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmd_prdPath, "prd_path", "", "")
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmd_workflow, "workflow", "sdlc", "(sdlc)")
	projectsCreateProjectCmd.RegisterFlagCompletionFunc("workflow", func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		return []string{"sdlc"}, cobra.ShellCompDirectiveNoFileComp
	})
	projectsCreateProjectCmd.Flags().StringVar(&projectsCreateProjectCmd_repoUrl, "repo_url", "", "")
	projectsCreateProjectCmd.Flags().StringArrayVar(&projectsCreateProjectCmd_tags, "tags", nil, "")
	projectsCreateProjectCmd.MarkFlagRequired("name")
	projectsCreateProjectCmd.MarkFlagRequired("workflow")
}
