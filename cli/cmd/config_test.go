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
	if !strings.Contains(out, "token=secret") {
		t.Error("list output missing token")
	}
	rootCmd.SetOut(nil) // reset
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

	// Clear env var so config value wins
	origToken := os.Getenv("DEVTRACK_TOKEN")
	os.Unsetenv("DEVTRACK_TOKEN")
	defer func() {
		if origToken != "" {
			os.Setenv("DEVTRACK_TOKEN", origToken)
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
