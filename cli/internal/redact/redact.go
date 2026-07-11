// Package redact masks secret-shaped values out of arbitrary command/message
// text before it leaves the machine, and caps text length with an explicit
// truncation marker. It is a pure string transform: no shell parsing, no
// network, no filesystem access.
package redact

import "regexp"

// MaxLength is the maximum length of text returned before truncation.
const MaxLength = 2000

// Placeholder replaces a masked secret value.
const Placeholder = "[REDACTED]"

// TruncationMarker is appended when text is truncated for exceeding MaxLength.
const TruncationMarker = "…[truncated]"

// secretKey matches a key token containing (case-insensitively, as a
// substring) one of the recognized secret keywords, with an optional
// "export " prefix preserved as part of the match.
const secretKey = `(?:export\s+)?[\w-]*(?:token|secret|password|key|authorization)[\w-]*`

// quoted matches a double- or single-quoted string as one unit, so a value
// containing internal spaces (e.g. `"a b c"`) is masked whole rather than
// only up to its first space.
const quoted = `"[^"]*"|'[^']*'`

var (
	// assignRe matches KEY=VALUE where KEY is secret-shaped, tolerating an
	// optional surrounding quote and trailing bracket around the key (e.g.
	// Python's os.environ['SECRET_KEY'] = ... / config["api_key"]=...) and
	// whitespace around "=" — mirroring the quote tolerance headerRe already
	// has for its ":" path. The value is either a quoted string or a run of
	// characters stopping at whitespace or a shell metacharacter, so chained
	// commands (e.g. "&&next-command") are left untouched.
	assignRe = regexp.MustCompile(`(?i)(["']?)(` + secretKey + `)(["']?)\s*(\]?)\s*=\s*(?:` + quoted + `|[^\s&|;<>]+)`)

	// headerRe matches "KEY: VALUE" (optionally JSON-quoted-key, e.g.
	// `"password": "v"`) where KEY is secret-shaped, tolerating whitespace
	// around the separator, which is "::=" (double-colon-equals), ":="
	// (walrus), or a bare ":" — tried in that order so the longer forms win
	// first. This also lets the value alternation start at the true value
	// position instead of falling through to the unquoted branch at a stray
	// "=". The value is either a quoted string, or a run of characters that
	// must not itself start with a colon (so scope-resolution "::" as in
	// Secret::Encrypt(data) or Token::DEFAULT_TTL is left alone — the bare
	// ":" separator alternative would otherwise match the first colon and
	// mistake the second for the start of a header value) and stops at a
	// stray quote or newline, so a header embedded in a surrounding quoted
	// argument (e.g. curl -H "Authorization: ...") doesn't swallow the
	// closing quote and any trailing content.
	headerRe = regexp.MustCompile(`(?i)(["']?)(` + secretKey + `)(["']?)\s*(?:::=|:=|:)\s*(?:` + quoted + `|[^"'\n:][^"'\n]*)`)
)

// Redact masks secret-shaped values in s and caps its length. Only the value
// half of a KEY=VALUE or "KEY: VALUE" pair is replaced when the key contains
// a recognized secret keyword (token, secret, password, key, authorization);
// the key, any "export " prefix, and the separator are preserved. Trigger
// words that appear outside an assignment/header shape (e.g. in a file path
// or as a bare word) pass through unchanged. Masking runs before the length
// cap so secrets in the retained head are always masked.
func Redact(s string) string {
	out := assignRe.ReplaceAllString(s, "$1$2$3$4="+Placeholder)
	out = headerRe.ReplaceAllString(out, "$1$2$3: "+Placeholder)

	if len(out) > MaxLength {
		out = out[:MaxLength] + TruncationMarker
	}

	return out
}
