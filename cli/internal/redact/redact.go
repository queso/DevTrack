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

var (
	// assignRe matches KEY=VALUE where KEY is secret-shaped. The value is any
	// run of non-whitespace characters, so shell metacharacters and text
	// following whitespace (e.g. "&& next-command") are left untouched.
	assignRe = regexp.MustCompile(`(?i)(` + secretKey + `)=\S+`)

	// headerRe matches "KEY: VALUE" where KEY is secret-shaped. The value
	// runs to the end of the line, since header-style values (e.g.
	// "Bearer <token>") may contain spaces.
	headerRe = regexp.MustCompile(`(?i)(` + secretKey + `):\s?[^\n]*`)
)

// Redact masks secret-shaped values in s and caps its length. Only the value
// half of a KEY=VALUE or "KEY: VALUE" pair is replaced when the key contains
// a recognized secret keyword (token, secret, password, key, authorization);
// the key, any "export " prefix, and the separator are preserved. Trigger
// words that appear outside an assignment/header shape (e.g. in a file path
// or as a bare word) pass through unchanged. Masking runs before the length
// cap so secrets in the retained head are always masked.
func Redact(s string) string {
	out := assignRe.ReplaceAllString(s, "$1="+Placeholder)
	out = headerRe.ReplaceAllString(out, "$1: "+Placeholder)

	if len(out) > MaxLength {
		out = out[:MaxLength] + TruncationMarker
	}

	return out
}
