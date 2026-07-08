package client

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// captureHeaders spins up a test server that records the headers of the first
// request it receives, then returns a client pointed at it plus a pointer to
// the captured headers.
func captureHeaders(t *testing.T) (*Client, *http.Header) {
	t.Helper()
	var got http.Header
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Clone()
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":{}}`))
	}))
	t.Cleanup(srv.Close)
	return NewClient(srv.URL, "test-token"), &got
}

func TestExecute_SendsAccessHeadersWhenEnvSet(t *testing.T) {
	t.Setenv("ACCESS_CLIENT_ID", "cid-123.access")
	t.Setenv("ACCESS_CLIENT_SECRET", "csecret-abc")

	c, got := captureHeaders(t)
	if _, err := c.Do(http.MethodGet, "/status/all", nil, nil, nil); err != nil {
		t.Fatalf("Do returned error: %v", err)
	}

	if v := got.Get("CF-Access-Client-Id"); v != "cid-123.access" {
		t.Errorf("CF-Access-Client-Id = %q, want %q", v, "cid-123.access")
	}
	if v := got.Get("CF-Access-Client-Secret"); v != "csecret-abc" {
		t.Errorf("CF-Access-Client-Secret = %q, want %q", v, "csecret-abc")
	}
	if v := got.Get("Authorization"); v != "Bearer test-token" {
		t.Errorf("Authorization = %q, want %q", v, "Bearer test-token")
	}
}

func TestExecute_NoAccessHeadersWhenEnvUnset(t *testing.T) {
	// Ensure a clean slate even if the ambient environment has them set.
	t.Setenv("ACCESS_CLIENT_ID", "")
	t.Setenv("ACCESS_CLIENT_SECRET", "")

	c, got := captureHeaders(t)
	if _, err := c.Do(http.MethodGet, "/status/all", nil, nil, nil); err != nil {
		t.Fatalf("Do returned error: %v", err)
	}

	if _, ok := (*got)["Cf-Access-Client-Id"]; ok {
		t.Errorf("CF-Access-Client-Id header should be absent when env is unset")
	}
	if _, ok := (*got)["Cf-Access-Client-Secret"]; ok {
		t.Errorf("CF-Access-Client-Secret header should be absent when env is unset")
	}
}

func TestExecute_NoAccessHeadersWhenOnlyIDSet(t *testing.T) {
	// A half-configured service token (only the ID) must not send either header.
	t.Setenv("ACCESS_CLIENT_ID", "cid-only")
	t.Setenv("ACCESS_CLIENT_SECRET", "")

	c, got := captureHeaders(t)
	if _, err := c.Do(http.MethodGet, "/status/all", nil, nil, nil); err != nil {
		t.Fatalf("Do returned error: %v", err)
	}

	if _, ok := (*got)["Cf-Access-Client-Id"]; ok {
		t.Errorf("CF-Access-Client-Id header should be absent when secret is missing")
	}
}
