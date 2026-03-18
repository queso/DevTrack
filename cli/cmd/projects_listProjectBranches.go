package cmd

import (
	"fmt"
	"os"
	"strconv"
	"github.com/spf13/cobra"
	"devtrack/internal/client"
	"devtrack/internal/output"
)

var (
	projectsListProjectBranchesCmd_isActive bool
)

var projectsListProjectBranchesCmd = &cobra.Command{
	Use: "listProjectBranches <id>",
	Short: "List branches for a project",
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		pathParams["id"] = args[0]
		queryParams := map[string]string{}
		queryParams["is_active"] = strconv.FormatBool(projectsListProjectBranchesCmd_isActive)
		resp, err := c.Do("GET", "/projects/{id}/branches", pathParams, queryParams, nil)
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
	projectsCmd.AddCommand(projectsListProjectBranchesCmd)
	projectsListProjectBranchesCmd.Flags().BoolVar(&projectsListProjectBranchesCmd_isActive, "is_active", false, "")
}
