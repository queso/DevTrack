package cmd

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"devtrack/internal/redact"
)

// ---------------------------------------------------------------------------
// WI-584: PostToolUse hook records a tool_use event from Claude hook JSON on
// stdin, routed through the WI-581 sendEvent enforcement point. Contract:
//
//	func runToolUseHook(stdin io.Reader) error
//
// Reads {tool_input:{command}, session_id, cwd}; sends one tool_use event whose
// title is the (redacted) command and whose metadata carries session_id + cwd.
// Absent/malformed stdin exits quietly with no event. Uses the shared
// setupEventCapture / acmeManifest helpers from event_test.go.
// ---------------------------------------------------------------------------

func findClaudeHookDef(t *testing.T, event string) claudeCodeHookDef {
	t.Helper()
	for _, d := range claudeCodeHooks {
		if d.Event == event {
			return d
		}
	}
	t.Fatalf("no claudeCodeHooks entry for event %q", event)
	return claudeCodeHookDef{}
}

// AC1-4: valid PostToolUse JSON on stdin -> exactly one tool_use event whose
// title is the redacted command and whose metadata has session_id + cwd. The
// redaction and identity resolution present in the payload can only come from
// sendEvent, structurally pinning AC2 ("does not build its own body/POST").
func TestRunToolUseHook_SendsToolUseEventViaSendEvent(t *testing.T) {
	cap := setupEventCapture(t, acmeManifest)
	payload := `{"session_id":"sess-123","cwd":"/work/acme","tool_name":"Bash","tool_input":{"command":"export API_KEY=abc123def456 && npm test"}}`

	if err := runToolUseHook(strings.NewReader(payload)); err != nil {
		t.Fatalf("runToolUseHook: %v", err)
	}
	body := cap.decode(t)

	if body["type"] != "tool_use" {
		t.Errorf("type: got %v, want tool_use (a Bash tool call must never be a commit)", body["type"])
	}
	title, _ := body["title"].(string)
	if strings.Contains(title, "abc123def456") {
		t.Errorf("secret not redacted in command title: %q", title)
	}
	if !strings.Contains(title, redact.Placeholder) {
		t.Errorf("expected redaction placeholder in title (proves it went through sendEvent): %q", title)
	}
	if !strings.Contains(title, "npm test") {
		t.Errorf("non-secret command text missing from title: %q", title)
	}
	// Identity resolved by sendEvent from the repo cwd (not the payload cwd).
	if body["repo_url"] != "https://github.com/acme/widgets" {
		t.Errorf("identity not resolved via sendEvent: repo_url %v", body["repo_url"])
	}
	meta, ok := body["metadata"].(map[string]interface{})
	if !ok {
		t.Fatalf("metadata missing or not an object: %v", body["metadata"])
	}
	if meta["session_id"] != "sess-123" {
		t.Errorf("metadata session_id: got %v, want sess-123", meta["session_id"])
	}
	if meta["cwd"] != "/work/acme" {
		t.Errorf("metadata cwd: got %v, want /work/acme", meta["cwd"])
	}
}

// AC5: because the command is read from stdin JSON (not an argv flag), quotes,
// newlines, and shell metacharacters survive intact (redact preserves them).
func TestRunToolUseHook_PreservesCommandMetacharacters(t *testing.T) {
	cap := setupEventCapture(t, acmeManifest)
	command := "echo \"hi there\" | grep foo && cat f\nsecond-line > /dev/null"
	payload, err := json.Marshal(map[string]interface{}{
		"session_id": "s1",
		"cwd":        "/x",
		"tool_input": map[string]interface{}{"command": command},
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	if err := runToolUseHook(strings.NewReader(string(payload))); err != nil {
		t.Fatalf("runToolUseHook: %v", err)
	}
	if got, _ := cap.decode(t)["title"].(string); got != command {
		t.Errorf("command metacharacters not transmitted intact:\n got %q\nwant %q", got, command)
	}
}

// AC6: absent or malformed stdin (hand-run hook, harness change) exits quietly
// with NO event sent — no empty or garbage rows.
func TestRunToolUseHook_AbsentOrMalformedStdinSendsNothing(t *testing.T) {
	cases := []struct{ name, stdin string }{
		{"empty stdin", ""},
		{"malformed json", "{not valid json"},
		{"missing command", `{"session_id":"s","cwd":"/x","tool_input":{}}`},
		{"empty command", `{"session_id":"s","cwd":"/x","tool_input":{"command":""}}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cap := setupEventCapture(t, acmeManifest)
			if err := runToolUseHook(strings.NewReader(tc.stdin)); err != nil {
				t.Errorf("expected a quiet nil exit for %s, got error: %v", tc.name, err)
			}
			if len(cap.body) != 0 {
				t.Errorf("expected NO event sent for %s, but a request was POSTed: %s", tc.name, string(cap.body))
			}
		})
	}
}

// AC7: no claudeCodeHooks entry references project.yaml; the PostToolUse entry
// routes to the tool_use hook command (not --type commit), scoped to Bash and
// non-blocking; SessionStart/Stop keep their types without --project-yaml.
func TestClaudeCodeHooks_PostToolUseIsToolUseAndNoProjectYaml(t *testing.T) {
	for _, d := range claudeCodeHooks {
		if strings.Contains(d.Command, "project.yaml") {
			t.Errorf("%s entry still references project.yaml: %q", d.Event, d.Command)
		}
		if !strings.Contains(d.Command, "|| true") {
			t.Errorf("%s entry is not non-blocking (missing '|| true'): %q", d.Event, d.Command)
		}
	}

	post := findClaudeHookDef(t, "PostToolUse")
	if strings.Contains(post.Command, "--type commit") {
		t.Errorf("PostToolUse still fires --type commit (phantom commit): %q", post.Command)
	}
	if !strings.Contains(post.Command, "tooluse") {
		t.Errorf("PostToolUse does not route to the tool_use hook command: %q", post.Command)
	}
	if post.Matcher != "Bash" {
		t.Errorf("PostToolUse matcher: got %q, want Bash", post.Matcher)
	}

	start := findClaudeHookDef(t, "SessionStart")
	if !strings.Contains(start.Command, "session-start") {
		t.Errorf("SessionStart entry lost its type: %q", start.Command)
	}
	stop := findClaudeHookDef(t, "Stop")
	if !strings.Contains(stop.Command, "session-end") {
		t.Errorf("Stop entry lost its type: %q", stop.Command)
	}
}

// AC7 (plugin bundle): hooks/hooks.json PostToolUse routes to the tool_use hook
// command, and no command references project.yaml.
func TestHooksJSONBundle_PostToolUseIsToolUseAndNoProjectYaml(t *testing.T) {
	path := filepath.Join("..", "..", "hooks", "hooks.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if strings.Contains(string(data), "project.yaml") {
		t.Errorf("hooks/hooks.json still references project.yaml:\n%s", string(data))
	}

	var bundle struct {
		Hooks map[string][]struct {
			Matcher string `json:"matcher"`
			Hooks   []struct {
				Command string `json:"command"`
			} `json:"hooks"`
		} `json:"hooks"`
	}
	if err := json.Unmarshal(data, &bundle); err != nil {
		t.Fatalf("parse hooks.json: %v", err)
	}

	post, ok := bundle.Hooks["PostToolUse"]
	if !ok || len(post) == 0 || len(post[0].Hooks) == 0 {
		t.Fatal("hooks.json has no PostToolUse hook command")
	}
	cmd := post[0].Hooks[0].Command
	if strings.Contains(cmd, "--type commit") {
		t.Errorf("hooks.json PostToolUse still fires --type commit: %q", cmd)
	}
	if !strings.Contains(cmd, "tooluse") {
		t.Errorf("hooks.json PostToolUse does not route to the tool_use hook command: %q", cmd)
	}
	if !strings.Contains(cmd, "|| true") {
		t.Errorf("hooks.json PostToolUse is not non-blocking: %q", cmd)
	}
	if post[0].Matcher != "Bash" {
		t.Errorf("hooks.json PostToolUse matcher: got %q, want Bash", post[0].Matcher)
	}
}
