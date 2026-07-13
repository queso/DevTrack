package cmd

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"devtrack/internal"
)

func TestConfigSet_CreatesFile(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")

	rootCmd.SetArgs([]string{"config", "set", "api_url", "http://localhost:3001", "--config", cfgPath})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("config set: %v", err)
	}

	cfg, err := internal.LoadConfig(cfgPath)
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.APIUrl != "http://localhost:3001" {
		t.Errorf("APIUrl = %q, want %q", cfg.APIUrl, "http://localhost:3001")
	}
}

func TestConfigGet_PrintsValue(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")

	cfg := internal.Config{APIUrl: "http://example.com", Token: "tok"}
	if err := internal.SaveConfig(cfgPath, cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetArgs([]string{"config", "get", "api_url", "--config", cfgPath})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("config get: %v", err)
	}

	got := strings.TrimSpace(buf.String())
	if got != "http://example.com" {
		t.Errorf("got %q, want %q", got, "http://example.com")
	}
	rootCmd.SetOut(nil) // reset
}

func TestConfigList_PrintsAll(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")

	cfg := internal.Config{APIUrl: "http://test.com", Token: "secret"}
	if err := internal.SaveConfig(cfgPath, cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetArgs([]string{"config", "list", "--config", cfgPath})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("config list: %v", err)
	}

	out := buf.String()
	if !strings.Contains(out, "api_url=http://test.com") {
		t.Error("list output missing api_url")
	}
	// The token key is present but its value is masked (see
	// TestConfigList_MasksSecretValues).
	if !strings.Contains(out, "token=") {
		t.Error("list output missing token key")
	}
	rootCmd.SetOut(nil) // reset
}

// config list must never echo secret values to stdout — they would persist in
// terminal scrollback, CI logs, or redirected files. token and
// access_client_secret are masked; api_url and access_client_id (a non-secret
// identifier) stay visible. Regression test for the PR #19 security review.
func TestConfigList_MasksSecretValues(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")

	cfg := internal.Config{
		APIUrl:             "http://test.com",
		Token:              "super-secret-token",
		AccessClientID:     "client-id-not-secret",
		AccessClientSecret: "super-secret-value",
	}
	if err := internal.SaveConfig(cfgPath, cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetArgs([]string{"config", "list", "--config", cfgPath})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("config list: %v", err)
	}
	rootCmd.SetOut(nil)

	out := buf.String()

	// Secret values must not appear in plaintext.
	if strings.Contains(out, "super-secret-token") {
		t.Errorf("token value leaked in list output:\n%s", out)
	}
	if strings.Contains(out, "super-secret-value") {
		t.Errorf("access_client_secret value leaked in list output:\n%s", out)
	}
	// Masked keys still show presence.
	if !strings.Contains(out, "token=[hidden]") {
		t.Errorf("token not masked as [hidden]:\n%s", out)
	}
	if !strings.Contains(out, "access_client_secret=[hidden]") {
		t.Errorf("access_client_secret not masked as [hidden]:\n%s", out)
	}
	// Non-secret values stay visible for debuggability.
	if !strings.Contains(out, "api_url=http://test.com") {
		t.Errorf("api_url should be visible:\n%s", out)
	}
	if !strings.Contains(out, "access_client_id=client-id-not-secret") {
		t.Errorf("access_client_id should be visible:\n%s", out)
	}
}

// An unset secret masks to empty (not "[hidden]"), so `config list` accurately
// distinguishes configured from unconfigured keys.
func TestConfigList_UnsetSecretMasksToEmpty(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")

	cfg := internal.Config{APIUrl: "http://test.com"}
	if err := internal.SaveConfig(cfgPath, cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetArgs([]string{"config", "list", "--config", cfgPath})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("config list: %v", err)
	}
	rootCmd.SetOut(nil)

	if out := buf.String(); !strings.Contains(out, "token=\n") {
		t.Errorf("unset token should mask to empty, got:\n%s", out)
	}
}

func TestConfigSet_InvalidKey(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")

	rootCmd.SetArgs([]string{"config", "set", "bad_key", "val", "--config", cfgPath})
	err := rootCmd.Execute()
	if err == nil {
		t.Fatal("expected error for invalid key")
	}
}

func TestConfigGet_MissingFile(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "nonexistent.yaml")

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetArgs([]string{"config", "get", "api_url", "--config", cfgPath})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("config get with missing file: %v", err)
	}

	got := strings.TrimSpace(buf.String())
	if got != "" {
		t.Errorf("expected empty output for missing config, got %q", got)
	}
	rootCmd.SetOut(nil)
}

func TestPersistentPreRunE_SetsBaseURLFromEnvVar(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")

	// Config has a value, but env var should win
	cfg := internal.Config{APIUrl: "http://from-config:9000/api/v1"}
	if err := internal.SaveConfig(cfgPath, cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	t.Setenv("DEVTRACK_API_URL", "http://from-env:8000/api/v1")

	f := rootCmd.PersistentFlags().Lookup("base-url")
	f.Value.Set("/api/v1")
	f.Changed = false

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetArgs([]string{"config", "list", "--config", cfgPath})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("Execute: %v", err)
	}

	baseURL, _ := rootCmd.PersistentFlags().GetString("base-url")
	if baseURL != "http://from-env:8000/api/v1" {
		t.Errorf("base-url = %q, want %q (env var should take precedence over config)", baseURL, "http://from-env:8000/api/v1")
	}
	rootCmd.SetOut(nil)
}

func TestPersistentPreRunE_SetsBaseURLFromConfig(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")

	cfg := internal.Config{APIUrl: "http://from-config:9000/api/v1"}
	if err := internal.SaveConfig(cfgPath, cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	// Clear DEVTRACK_API_URL so the config value is what resolves — env wins
	// over config by design, and a developer machine may export it.
	t.Setenv("DEVTRACK_API_URL", "")
	os.Unsetenv("DEVTRACK_API_URL")

	// Reset base-url to default so it's not "Changed"
	f := rootCmd.PersistentFlags().Lookup("base-url")
	f.Value.Set("/api/v1")
	f.Changed = false

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetArgs([]string{"config", "list", "--config", cfgPath})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("Execute: %v", err)
	}

	// After PersistentPreRunE, base-url flag should reflect the config value
	baseURL, _ := rootCmd.PersistentFlags().GetString("base-url")
	if baseURL != "http://from-config:9000/api/v1" {
		t.Errorf("base-url = %q, want %q", baseURL, "http://from-config:9000/api/v1")
	}
	rootCmd.SetOut(nil)
}

func TestPersistentPreRunE_SetsTokenFromConfig(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")

	cfg := internal.Config{Token: "config-token-123"}
	if err := internal.SaveConfig(cfgPath, cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	// Clear env vars so the config value wins over both the canonical
	// DEVTRACK_API_KEY and the legacy DEVTRACK_TOKEN.
	origToken := os.Getenv("DEVTRACK_TOKEN")
	origAPIKey := os.Getenv("DEVTRACK_API_KEY")
	os.Unsetenv("DEVTRACK_TOKEN")
	os.Unsetenv("DEVTRACK_API_KEY")
	defer func() {
		if origToken != "" {
			os.Setenv("DEVTRACK_TOKEN", origToken)
		}
		if origAPIKey != "" {
			os.Setenv("DEVTRACK_API_KEY", origAPIKey)
		}
	}()

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetArgs([]string{"config", "list", "--config", cfgPath})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("Execute: %v", err)
	}

	if got := os.Getenv("DEVTRACK_TOKEN"); got != "config-token-123" {
		t.Errorf("DEVTRACK_TOKEN = %q, want %q", got, "config-token-123")
	}
	os.Unsetenv("DEVTRACK_TOKEN") // cleanup
	rootCmd.SetOut(nil)
}

// TestPersistentPreRunE_APIKeyPopulatesToken verifies that the canonical
// DEVTRACK_API_KEY is resolved into DEVTRACK_TOKEN (which every command reads),
// and that it takes precedence over both the legacy env var and the config file.
func TestPersistentPreRunE_APIKeyPopulatesToken(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")

	cfg := internal.Config{Token: "config-token-123"}
	if err := internal.SaveConfig(cfgPath, cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	origToken := os.Getenv("DEVTRACK_TOKEN")
	origAPIKey := os.Getenv("DEVTRACK_API_KEY")
	os.Unsetenv("DEVTRACK_TOKEN")
	os.Setenv("DEVTRACK_API_KEY", "canonical-key-abc")
	defer func() {
		os.Unsetenv("DEVTRACK_API_KEY")
		if origToken != "" {
			os.Setenv("DEVTRACK_TOKEN", origToken)
		}
		if origAPIKey != "" {
			os.Setenv("DEVTRACK_API_KEY", origAPIKey)
		}
	}()

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetArgs([]string{"config", "list", "--config", cfgPath})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("Execute: %v", err)
	}

	if got := os.Getenv("DEVTRACK_TOKEN"); got != "canonical-key-abc" {
		t.Errorf("DEVTRACK_TOKEN = %q, want %q (DEVTRACK_API_KEY should win)", got, "canonical-key-abc")
	}
	os.Unsetenv("DEVTRACK_TOKEN") // cleanup
	rootCmd.SetOut(nil)
}

// TestPersistentPreRunE_SetsAccessCredsFromConfig verifies that Cloudflare
// Access service-token creds resolve from the config file into the env vars
// client.NewClient reads, with existing env values taking precedence.
func TestPersistentPreRunE_SetsAccessCredsFromConfig(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.yaml")

	cfg := internal.Config{AccessClientID: "cfg-id", AccessClientSecret: "cfg-secret"}
	if err := internal.SaveConfig(cfgPath, cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	origID := os.Getenv("ACCESS_CLIENT_ID")
	origSecret := os.Getenv("ACCESS_CLIENT_SECRET")
	defer func() {
		os.Unsetenv("ACCESS_CLIENT_ID")
		os.Unsetenv("ACCESS_CLIENT_SECRET")
		if origID != "" {
			os.Setenv("ACCESS_CLIENT_ID", origID)
		}
		if origSecret != "" {
			os.Setenv("ACCESS_CLIENT_SECRET", origSecret)
		}
	}()

	// Case 1: env unset -> config fills both.
	os.Unsetenv("ACCESS_CLIENT_ID")
	os.Unsetenv("ACCESS_CLIENT_SECRET")

	var buf bytes.Buffer
	rootCmd.SetOut(&buf)
	rootCmd.SetArgs([]string{"config", "list", "--config", cfgPath})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if got := os.Getenv("ACCESS_CLIENT_ID"); got != "cfg-id" {
		t.Errorf("ACCESS_CLIENT_ID = %q, want cfg-id", got)
	}
	if got := os.Getenv("ACCESS_CLIENT_SECRET"); got != "cfg-secret" {
		t.Errorf("ACCESS_CLIENT_SECRET = %q, want cfg-secret", got)
	}

	// Case 2: env set -> env wins over config.
	os.Setenv("ACCESS_CLIENT_ID", "env-id")
	os.Setenv("ACCESS_CLIENT_SECRET", "env-secret")

	rootCmd.SetArgs([]string{"config", "list", "--config", cfgPath})
	if err := rootCmd.Execute(); err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if got := os.Getenv("ACCESS_CLIENT_ID"); got != "env-id" {
		t.Errorf("ACCESS_CLIENT_ID = %q, want env-id (env should win)", got)
	}
	if got := os.Getenv("ACCESS_CLIENT_SECRET"); got != "env-secret" {
		t.Errorf("ACCESS_CLIENT_SECRET = %q, want env-secret (env should win)", got)
	}
	rootCmd.SetOut(nil)
}
