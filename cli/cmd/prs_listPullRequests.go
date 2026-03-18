package cmd

import (
	"fmt"
	"os"
	"strconv"
	"github.com/spf13/cobra"
	"devtrack/internal/client"
	"devtrack/internal/output"
	"devtrack/internal/validate"
)

var (
	prsListPullRequestsCmdAll bool
	prsListPullRequestsCmd_status string
	prsListPullRequestsCmd_projectId string
	prsListPullRequestsCmd_author string
	prsListPullRequestsCmd_page int
	prsListPullRequestsCmd_perPage int
)

var prsListPullRequestsCmd = &cobra.Command{
	Use: "listPullRequests",
	Short: "List all pull requests (PR queue)",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		queryParams := map[string]string{}
		queryParams["status"] = prsListPullRequestsCmd_status
		queryParams["project_id"] = prsListPullRequestsCmd_projectId
		queryParams["author"] = prsListPullRequestsCmd_author
		queryParams["page"] = strconv.Itoa(prsListPullRequestsCmd_page)
		queryParams["per_page"] = strconv.Itoa(prsListPullRequestsCmd_perPage)
		if cmd.Flags().Changed("status") { if err := validate.Enum("status", prsListPullRequestsCmd_status, []string{"open", "closed", "merged", "draft", "review_requested", "changes_requested", "approved"}); err != nil { return err } }
		if prsListPullRequestsCmdAll {
			_cfg := client.PaginationConfig{
				Type: client.PaginationType("page"),
				PageParam: "page",
				SizeParam: "per_page",
				CursorParam: "",
			}
			_out, _err := client.FetchAll(c, "GET", "/prs", pathParams, queryParams, _cfg)
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
		resp, err := c.Do("GET", "/prs", pathParams, queryParams, nil)
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
	prsCmd.AddCommand(prsListPullRequestsCmd)
	prsListPullRequestsCmd.Flags().BoolVar(&prsListPullRequestsCmdAll, "all", false, "Auto-paginate through all pages")
	prsListPullRequestsCmd.Flags().StringVar(&prsListPullRequestsCmd_status, "status", "", "(open|closed|merged|draft|review_requested|changes_requested|approved)")
	prsListPullRequestsCmd.RegisterFlagCompletionFunc("status", func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		return []string{"open", "closed", "merged", "draft", "review_requested", "changes_requested", "approved"}, cobra.ShellCompDirectiveNoFileComp
	})
	prsListPullRequestsCmd.Flags().StringVar(&prsListPullRequestsCmd_projectId, "project_id", "", "")
	prsListPullRequestsCmd.Flags().StringVar(&prsListPullRequestsCmd_author, "author", "", "")
	prsListPullRequestsCmd.Flags().IntVar(&prsListPullRequestsCmd_page, "page", 0, "")
	prsListPullRequestsCmd.Flags().IntVar(&prsListPullRequestsCmd_perPage, "per_page", 0, "")
}
