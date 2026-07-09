package redact

import (
	"strings"
	"testing"
)

// These tests define the public contract of the redact package (implemented in
// redact.go). The contract:
//
//	const MaxLength int          // max returned length before truncation
//	const Placeholder string     // replaces a masked secret value
//	const TruncationMarker string// appended when text is truncated
//	func Redact(s string) string // masks secret-shaped values and caps length
//
// Redact is a pure function: no network, no filesystem, no shell parsing.
// Constants are referenced (not hardcoded) so the impl owns the exact values
// while these tests pin the behavior.

// ---------------------------------------------------------------------------
// AC1 + AC2: secret-shaped assignments and headers are masked value-only,
// with case-insensitive keyword matching.
// ---------------------------------------------------------------------------

func TestRedact_MasksSecretShapedValues(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		secret  string // the value that must NOT survive in the output
		keyword string // the key/label that MUST survive in the output
	}{
		{"export assignment", "export API_KEY=abc123def456", "abc123def456", "API_KEY"},
		{"lowercase token assignment", "token=deadbeefcafe99", "deadbeefcafe99", "token"},
		{"uppercase secret assignment", "SECRET=hunter2value", "hunter2value", "SECRET"},
		{"mixed-case password assignment", "Password=pAssw0rdVal", "pAssw0rdVal", "Password"},
		{"password header", "password: pAssw0rd-Value", "pAssw0rd-Value", "password"},
		{"authorization bearer header", "Authorization: Bearer eyJhbGciOiJIUzI1", "eyJhbGciOiJIUzI1", "Authorization"},
		{"uppercase TOKEN header", "TOKEN: ghp_Zm9vYmFyYmF6", "ghp_Zm9vYmFyYmF6", "TOKEN"},
		{"api key composite keyword", "api_key=Zm9vYmFyYmF6cXV4", "Zm9vYmFyYmF6cXV4", "api_key"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := Redact(tc.input)

			if strings.Contains(out, tc.secret) {
				t.Errorf("secret value %q leaked in output %q", tc.secret, out)
			}
			if !strings.Contains(out, tc.keyword) {
				t.Errorf("expected key/label %q preserved in output %q", tc.keyword, out)
			}
			if !strings.Contains(out, Placeholder) {
				t.Errorf("expected redaction placeholder %q in output %q", Placeholder, out)
			}
		})
	}
}

// The 'export' prefix and key must survive; only the value is masked.
func TestRedact_MasksValueOnly(t *testing.T) {
	out := Redact("export API_KEY=abc123def456")

	if !strings.Contains(out, "export API_KEY=") {
		t.Errorf("expected 'export API_KEY=' prefix preserved, got %q", out)
	}
	if strings.Contains(out, "abc123def456") {
		t.Errorf("secret value leaked in output %q", out)
	}
	if !strings.HasSuffix(out, Placeholder) {
		t.Errorf("expected value replaced by placeholder at end, got %q", out)
	}
}

// ---------------------------------------------------------------------------
// AC3: trigger words in paths or prose (not in assignment/header shape) must
// pass through completely unchanged.
// ---------------------------------------------------------------------------

func TestRedact_NoFalsePositivesOnPathsAndProse(t *testing.T) {
	cases := []struct {
		name  string
		input string
	}{
		{"trigger word in file path", "vim docs/api-keys.md"},
		{"password in filename", "cat notes/passwords.txt"},
		{"token as bare argument", "grep token ./src"},
		{"secret in directory name", "cd /home/user/secret-santa"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := Redact(tc.input)
			if out != tc.input {
				t.Errorf("expected unchanged output for %q, got %q", tc.input, out)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// AC4: length cap with an explicit truncation marker. At/under the cap the
// text is unchanged; over the cap it is truncated and marked.
// ---------------------------------------------------------------------------

func TestRedact_UnderCapUnchanged(t *testing.T) {
	input := strings.Repeat("a", MaxLength-1)
	out := Redact(input)
	if out != input {
		t.Errorf("expected under-cap text unchanged (len %d), output differed (len %d)", len(input), len(out))
	}
	if strings.Contains(out, TruncationMarker) {
		t.Errorf("did not expect truncation marker in under-cap output")
	}
}

func TestRedact_AtCapUnchanged(t *testing.T) {
	input := strings.Repeat("a", MaxLength)
	out := Redact(input)
	if out != input {
		t.Errorf("expected at-cap text (len %d) unchanged, output differed (len %d)", MaxLength, len(out))
	}
	if strings.Contains(out, TruncationMarker) {
		t.Errorf("did not expect truncation marker in at-cap output")
	}
}

func TestRedact_OverCapTruncatedWithMarker(t *testing.T) {
	input := strings.Repeat("a", MaxLength+500)
	out := Redact(input)

	if !strings.HasSuffix(out, TruncationMarker) {
		t.Errorf("expected output to end with truncation marker %q, got %q", TruncationMarker, out)
	}
	if len(out) >= len(input) {
		t.Errorf("expected truncated output shorter than input: len(out)=%d, len(input)=%d", len(out), len(input))
	}
	// The head of the input is preserved (truncation drops the tail).
	if !strings.HasPrefix(out, "aaaaaaaaaa") {
		t.Errorf("expected the head of the input preserved, got %q", out)
	}
}

// ---------------------------------------------------------------------------
// AC5: quotes, newlines, and shell metacharacters survive intact; only the
// secret value is masked. No shell re-interpretation, no corruption.
// ---------------------------------------------------------------------------

func TestRedact_PreservesMetacharactersWhileMaskingSecret(t *testing.T) {
	input := "echo \"start\";\nexport TOKEN=s3cr3tDeadBeef && cat f | grep 'x' > /dev/null\n"
	out := Redact(input)

	if strings.Contains(out, "s3cr3tDeadBeef") {
		t.Errorf("secret value leaked in output %q", out)
	}
	if !strings.Contains(out, Placeholder) {
		t.Errorf("expected placeholder in output %q", out)
	}
	// Every structural / metacharacter fragment must survive verbatim.
	for _, frag := range []string{"echo \"start\"", ";", "\n", "export TOKEN=", "&&", "cat f | grep 'x'", "> /dev/null"} {
		if !strings.Contains(out, frag) {
			t.Errorf("expected fragment %q preserved in output %q", frag, out)
		}
	}
}

func TestRedact_MetacharactersWithoutSecretUnchanged(t *testing.T) {
	input := "echo \"a\" | grep 'b' && cat c > /dev/null\n"
	out := Redact(input)
	if out != input {
		t.Errorf("expected metacharacter-only input unchanged, got %q", out)
	}
}

// ---------------------------------------------------------------------------
// WI-578 rework (Lynch probing): hostile inputs that leaked or corrupted.
// These exercise the value matcher against quoted strings, whitespace around
// the separator, quoted keys, and metacharacter-joined values. Each must fail
// against the value matcher that stops at the first space / requires KEY=
// adjacency / runs a header value to end-of-line.
// ---------------------------------------------------------------------------

// Leak class — the secret value must never survive anywhere in the output.

func TestRedact_QuotedValueWithSpacesFullyMasked(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		leaks   []string // fragments that must NOT appear in the output
		keyword string
	}{
		{"double-quoted phrase", `password="aaa111 s3cr3t phrase"`, []string{"aaa111", "s3cr3t", "phrase"}, "password"},
		{"single-quoted segments", `export TOKEN='aaa111 bbb222 ccc333'`, []string{"aaa111", "bbb222", "ccc333"}, "TOKEN"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := Redact(tc.input)
			for _, leak := range tc.leaks {
				if strings.Contains(out, leak) {
					t.Errorf("secret fragment %q leaked in output %q", leak, out)
				}
			}
			if !strings.Contains(out, Placeholder) {
				t.Errorf("expected placeholder in output %q", out)
			}
			if !strings.Contains(out, tc.keyword) {
				t.Errorf("expected key %q preserved in output %q", tc.keyword, out)
			}
		})
	}
}

func TestRedact_WhitespaceAroundAssignmentMasked(t *testing.T) {
	const secret = "abc123def456"
	cases := []struct{ name, input string }{
		{"space both sides", "API_KEY = " + secret},
		{"space before eq", "API_KEY =" + secret},
		{"space after eq", "API_KEY= " + secret},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := Redact(tc.input)
			if strings.Contains(out, secret) {
				t.Errorf("secret value %q leaked in output %q", secret, out)
			}
			if !strings.Contains(out, Placeholder) {
				t.Errorf("expected placeholder in output %q", out)
			}
			if !strings.Contains(out, "API_KEY") {
				t.Errorf("expected key preserved in output %q", out)
			}
		})
	}
}

func TestRedact_JSONQuotedKeyMasked(t *testing.T) {
	cases := []struct{ name, input, secret string }{
		{"spaced json", `{"password": "hunter2value"}`, "hunter2value"},
		{"compact json", `{"api_key":"Zm9vYmFyYmF6"}`, "Zm9vYmFyYmF6"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := Redact(tc.input)
			if strings.Contains(out, tc.secret) {
				t.Errorf("secret value %q leaked in output %q", tc.secret, out)
			}
			if !strings.Contains(out, Placeholder) {
				t.Errorf("expected placeholder in output %q", out)
			}
		})
	}
}

// Corruption class (AC5) — only the secret is masked; surrounding non-secret
// content (closing quotes, URLs, chained commands) must survive intact.

func TestRedact_HeaderInMidCommandPreservesTrailingContent(t *testing.T) {
	out := Redact(`curl -H "Authorization: Bearer abc123XYZ" https://example.com/path`)
	if strings.Contains(out, "abc123XYZ") {
		t.Errorf("credential leaked in output %q", out)
	}
	if !strings.Contains(out, Placeholder) {
		t.Errorf("expected placeholder in output %q", out)
	}
	if !strings.Contains(out, "https://example.com/path") {
		t.Errorf("expected trailing URL preserved (header value over-consumed) in output %q", out)
	}
}

func TestRedact_AssignmentBoundedAtShellMetacharacters(t *testing.T) {
	out := Redact("token=deadbeefcafe&&curl evil.example.com")
	if strings.Contains(out, "deadbeefcafe") {
		t.Errorf("secret value leaked in output %q", out)
	}
	if !strings.Contains(out, Placeholder) {
		t.Errorf("expected placeholder in output %q", out)
	}
	if !strings.Contains(out, "&&curl evil.example.com") {
		t.Errorf("expected chained command preserved (value over-consumed) in output %q", out)
	}
}

// ---------------------------------------------------------------------------
// WI-578 rework (Amy probing): Go-style ":=" assignment with a QUOTED value
// bypassed both matchers and leaked the secret. Realistic in Go source snippets
// pasted into commit messages / tool_use descriptions (`apiKey := "..."`).
// The stray "=" after ":" must not knock the value matcher off the real value.
// ---------------------------------------------------------------------------

func TestRedact_ColonEqualsQuotedValueMasked(t *testing.T) {
	cases := []struct{ name, input, secret string }{
		{"spaced walrus", `token := "abc123deadbeef"`, "abc123deadbeef"},
		{"api key walrus", `apiKey := "sk-live-9f8e7d6c"`, "sk-live-9f8e7d6c"},
		{"no space before eq", `secret :="mysecretvalue"`, "mysecretvalue"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := Redact(tc.input)
			if strings.Contains(out, tc.secret) {
				t.Errorf("secret value %q leaked in output %q", tc.secret, out)
			}
			if !strings.Contains(out, Placeholder) {
				t.Errorf("expected placeholder in output %q", out)
			}
		})
	}
}

// Guard: the unquoted ":=" form already masks correctly (the fallback consumes
// the whole remainder). A fix for the quoted case must not regress it.
func TestRedact_ColonEqualsUnquotedValueMasked(t *testing.T) {
	out := Redact("token:=abc123deadbeef")
	if strings.Contains(out, "abc123deadbeef") {
		t.Errorf("secret value leaked in output %q", out)
	}
	if !strings.Contains(out, Placeholder) {
		t.Errorf("expected placeholder in output %q", out)
	}
}

// ---------------------------------------------------------------------------
// WI-578 rework (Lynch round 3): the "=" path lacks the quoted-key tolerance
// the ":" path got for JSON-shaped secrets. A bracketed / quoted key before the
// "=" (Python os.environ / dict style) leaves the value unmasked. Realistic in
// Python source snippets pasted into commit messages / tool_use descriptions.
// This mirrors TestRedact_JSONQuotedKeyMasked on the "=" separator.
// ---------------------------------------------------------------------------

func TestRedact_QuotedOrBracketedKeyAssignmentMasked(t *testing.T) {
	cases := []struct{ name, input, secret string }{
		{"os.environ bracketed key", `os.environ['SECRET_KEY'] = "hunter2value"`, "hunter2value"},
		{"dict compact key", `config["api_key"]="sk-live-9f8e7d"`, "sk-live-9f8e7d"},
		{"bare quoted key", `"password" = "p@ssw0rdValue"`, "p@ssw0rdValue"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := Redact(tc.input)
			if strings.Contains(out, tc.secret) {
				t.Errorf("secret value %q leaked in output %q", tc.secret, out)
			}
			if !strings.Contains(out, Placeholder) {
				t.Errorf("expected placeholder in output %q", out)
			}
		})
	}
}
