package internal

import (
	"errors"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// HTTPError.Error() tests
// ---------------------------------------------------------------------------

func TestHTTPError_Error_FormatsStatusAndBody(t *testing.T) {
	e := &HTTPError{StatusCode: 404, Body: "not found"}
	msg := e.Error()

	if !strings.Contains(msg, "404") {
		t.Errorf("HTTPError.Error() should include the status code, got: %q", msg)
	}
	if !strings.Contains(msg, "not found") {
		t.Errorf("HTTPError.Error() should include the body, got: %q", msg)
	}
}

func TestHTTPError_Error_500WithBody(t *testing.T) {
	e := &HTTPError{StatusCode: 500, Body: "internal server error"}
	msg := e.Error()

	if msg != "HTTP 500: internal server error" {
		t.Errorf("unexpected error format: %q", msg)
	}
}

func TestHTTPError_Error_EmptyBody(t *testing.T) {
	e := &HTTPError{StatusCode: 401, Body: ""}
	msg := e.Error()

	if !strings.Contains(msg, "401") {
		t.Errorf("HTTPError.Error() should include status code even with empty body, got: %q", msg)
	}
}

func TestHTTPError_ImplementsErrorInterface(t *testing.T) {
	var err error = &HTTPError{StatusCode: 200, Body: "ok"}
	if err == nil {
		t.Fatal("*HTTPError should satisfy the error interface")
	}
}

// ---------------------------------------------------------------------------
// FormatHTTPError tests
// ---------------------------------------------------------------------------

func TestFormatHTTPError_ReturnsNonNilError(t *testing.T) {
	err := FormatHTTPError(400, "bad request")
	if err == nil {
		t.Fatal("FormatHTTPError should return a non-nil error")
	}
}

func TestFormatHTTPError_MessageContainsStatusCode(t *testing.T) {
	err := FormatHTTPError(403, "forbidden")
	if !strings.Contains(err.Error(), "403") {
		t.Errorf("FormatHTTPError message should contain status code, got: %q", err.Error())
	}
}

func TestFormatHTTPError_MessageContainsBody(t *testing.T) {
	err := FormatHTTPError(422, "unprocessable entity")
	if !strings.Contains(err.Error(), "unprocessable entity") {
		t.Errorf("FormatHTTPError message should contain body, got: %q", err.Error())
	}
}

func TestFormatHTTPError_Format(t *testing.T) {
	err := FormatHTTPError(503, "service unavailable")
	expected := "HTTP 503: service unavailable"
	if err.Error() != expected {
		t.Errorf("expected %q, got %q", expected, err.Error())
	}
}

func TestFormatHTTPError_IsNotHTTPErrorType(t *testing.T) {
	// FormatHTTPError returns a plain fmt.Errorf error, not an *HTTPError.
	// Verify it does not unwrap to *HTTPError.
	err := FormatHTTPError(500, "boom")
	var httpErr *HTTPError
	if errors.As(err, &httpErr) {
		t.Error("FormatHTTPError should not wrap an *HTTPError value")
	}
}

func TestFormatHTTPError_EmptyBody(t *testing.T) {
	err := FormatHTTPError(204, "")
	if err == nil {
		t.Fatal("FormatHTTPError should return non-nil for any status code")
	}
	if !strings.Contains(err.Error(), "204") {
		t.Errorf("error message should contain status code, got: %q", err.Error())
	}
}
