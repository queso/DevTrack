package cmd

import (
	"fmt"
	"os"
	"strings"
	"strconv"
	"github.com/spf13/cobra"
	"devtrack/internal/client"
	"devtrack/internal/output"
	"devtrack/internal/validate"
)

var (
	projectsListProjectsCmdAll bool
	projectsListProjectsCmd_page int
	projectsListProjectsCmd_perPage int
	projectsListProjectsCmd_domain string
	projectsListProjectsCmd_workflow string
)

var projectsListProjectsCmd = &cobra.Command{
	Use: "listProjects",
	Short: "List all projects",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		queryParams := map[string]string{}
		queryParams["page"] = strconv.Itoa(projectsListProjectsCmd_page)
		queryParams["per_page"] = strconv.Itoa(projectsListProjectsCmd_perPage)
		queryParams["domain"] = projectsListProjectsCmd_domain
		queryParams["workflow"] = projectsListProjectsCmd_workflow
		projectsListProjectsCmd_tags_vals, _ := cmd.Flags().GetStringArray("tags")
		queryParams["tags"] = strings.Join(projectsListProjectsCmd_tags_vals, ",")
		if cmd.Flags().Changed("workflow") { if err := validate.Enum("workflow", projectsListProjectsCmd_workflow, []string{"sdlc", "content"}); err != nil { return err } }
		if projectsListProjectsCmdAll {
			_cfg := client.PaginationConfig{
				Type: client.PaginationType("page"),
				PageParam: "page",
				SizeParam: "per_page",
				CursorParam: "",
			}
			_out, _err := client.FetchAll(c, "GET", "/projects", pathParams, queryParams, _cfg)
			if _err != nil { return _err }
			jsonMode, _ := cmd.Root().PersistentFlags().GetBool("json")
			noColor, _ := cmd.Root().PersistentFlags().GetBool("no-color")
			if jsonMode {
				fmt.Printf("%s\n", string(_out))
			} else {
				if err := output.PrintTable(_out, noColor); err != nil {
					fmt.Println(string(_out))
				}
			}
			return nil
		}
		resp, err := c.Do("GET", "/projects", pathParams, queryParams, nil)
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
	projectsCmd.AddCommand(projectsListProjectsCmd)
	projectsListProjectsCmd.Flags().BoolVar(&projectsListProjectsCmdAll, "all", false, "Auto-paginate through all pages")
	projectsListProjectsCmd.Flags().IntVar(&projectsListProjectsCmd_page, "page", 0, "")
	projectsListProjectsCmd.Flags().IntVar(&projectsListProjectsCmd_perPage, "per_page", 0, "")
	projectsListProjectsCmd.Flags().StringVar(&projectsListProjectsCmd_domain, "domain", "", "")
	projectsListProjectsCmd.Flags().StringVar(&projectsListProjectsCmd_workflow, "workflow", "", "(sdlc|content)")
	projectsListProjectsCmd.RegisterFlagCompletionFunc("workflow", func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		return []string{"sdlc", "content"}, cobra.ShellCompDirectiveNoFileComp
	})
	projectsListProjectsCmd.Flags().StringArray("tags", nil, "")
}
