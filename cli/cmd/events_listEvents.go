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
	eventsListEventsCmdAll bool
	eventsListEventsCmd_projectId string
	eventsListEventsCmd_domain string
	eventsListEventsCmd_type string
	eventsListEventsCmd_from string
	eventsListEventsCmd_to string
	eventsListEventsCmd_page int
	eventsListEventsCmd_perPage int
)

var eventsListEventsCmd = &cobra.Command{
	Use: "listEvents",
	Short: "List events (cross-project timeline)",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		baseURL, _ := cmd.Root().PersistentFlags().GetString("base-url")
		token := os.Getenv("DEVTRACK_TOKEN")
		c := client.NewClient(baseURL, token)
		pathParams := map[string]string{}
		queryParams := map[string]string{}
		queryParams["project_id"] = eventsListEventsCmd_projectId
		queryParams["domain"] = eventsListEventsCmd_domain
		queryParams["type"] = eventsListEventsCmd_type
		queryParams["from"] = eventsListEventsCmd_from
		queryParams["to"] = eventsListEventsCmd_to
		queryParams["page"] = strconv.Itoa(eventsListEventsCmd_page)
		queryParams["per_page"] = strconv.Itoa(eventsListEventsCmd_perPage)
		if cmd.Flags().Changed("type") { if err := validate.Enum("type", eventsListEventsCmd_type, []string{"pr_opened", "pr_merged", "pr_closed", "pr_review_requested", "pr_changes_requested", "pr_approved", "pr_reviewed", "branch_created", "branch_deleted", "prd_created", "prd_updated", "prd_completed", "prd_synced", "work_item_created", "work_item_completed", "content_published", "content_updated", "commit", "push", "session_start", "session_end"}); err != nil { return err } }
		if eventsListEventsCmdAll {
			_cfg := client.PaginationConfig{
				Type: client.PaginationType("page"),
				PageParam: "page",
				SizeParam: "per_page",
				CursorParam: "",
			}
			_out, _err := client.FetchAll(c, "GET", "/events", pathParams, queryParams, _cfg)
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
		resp, err := c.Do("GET", "/events", pathParams, queryParams, nil)
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
	eventsCmd.AddCommand(eventsListEventsCmd)
	eventsListEventsCmd.Flags().BoolVar(&eventsListEventsCmdAll, "all", false, "Auto-paginate through all pages")
	eventsListEventsCmd.Flags().StringVar(&eventsListEventsCmd_projectId, "project_id", "", "")
	eventsListEventsCmd.Flags().StringVar(&eventsListEventsCmd_domain, "domain", "", "")
	eventsListEventsCmd.Flags().StringVar(&eventsListEventsCmd_type, "type", "", "(pr_opened|pr_merged|pr_closed|pr_review_requested|pr_changes_requested|pr_approved|pr_reviewed|branch_created|branch_deleted|prd_created|prd_updated|prd_completed|prd_synced|work_item_created|work_item_completed|content_published|content_updated|commit|push|session_start|session_end)")
	eventsListEventsCmd.RegisterFlagCompletionFunc("type", func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		return []string{"pr_opened", "pr_merged", "pr_closed", "pr_review_requested", "pr_changes_requested", "pr_approved", "pr_reviewed", "branch_created", "branch_deleted", "prd_created", "prd_updated", "prd_completed", "prd_synced", "work_item_created", "work_item_completed", "content_published", "content_updated", "commit", "push", "session_start", "session_end"}, cobra.ShellCompDirectiveNoFileComp
	})
	eventsListEventsCmd.Flags().StringVar(&eventsListEventsCmd_from, "from", "", "")
	eventsListEventsCmd.Flags().StringVar(&eventsListEventsCmd_to, "to", "", "")
	eventsListEventsCmd.Flags().IntVar(&eventsListEventsCmd_page, "page", 0, "")
	eventsListEventsCmd.Flags().IntVar(&eventsListEventsCmd_perPage, "per_page", 0, "")
}
