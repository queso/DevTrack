package internal

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultConfigPath_ContainsDevtrack(t *testing.T) {
	p := DefaultConfigPath()
	if p == "" {
		t.Fatal("DefaultConfigPath returned empty string")
	}
	if !filepath.IsAbs(p) && p[0] != '~' {
		t.Errorf("expected absolute path or ~, got %q", p)
	}
}

func TestLoadConfig_MissingFile(t *testing.T) {
	cfg, err := LoadConfig(filepath.Join(t.TempDir(), "nonexistent.yaml"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.APIUrl != "" || cfg.Token != "" {
		t.Error("expected empty config for missing file")
	}
}

func TestSaveAndLoadConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "config.yaml")
	cfg := Config{APIUrl: "http://localhost:3001/api/v1", Token: "secret"}

	if err := SaveConfig(path, cfg); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}

	loaded, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if loaded.APIUrl != cfg.APIUrl {
		t.Errorf("APIUrl = %q, want %q", loaded.APIUrl, cfg.APIUrl)
	}
	if loaded.Token != cfg.Token {
		t.Errorf("Token = %q, want %q", loaded.Token, cfg.Token)
	}
}

func TestGetConfigValue_ValidKeys(t *testing.T) {
	cfg := Config{APIUrl: "http://example.com", Token: "tok"}

	val, err := GetConfigValue(cfg, "api_url")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != "http://example.com" {
		t.Errorf("got %q, want %q", val, "http://example.com")
	}

	val, err = GetConfigValue(cfg, "token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if val != "tok" {
		t.Errorf("got %q, want %q", val, "tok")
	}
}

func TestGetConfigValue_InvalidKey(t *testing.T) {
	cfg := Config{}
	_, err := GetConfigValue(cfg, "bad_key")
	if err == nil {
		t.Fatal("expected error for invalid key")
	}
}

func TestSetConfigValue_ValidKeys(t *testing.T) {
	var cfg Config

	if err := SetConfigValue(&cfg, "api_url", "http://test.com"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.APIUrl != "http://test.com" {
		t.Errorf("APIUrl = %q, want %q", cfg.APIUrl, "http://test.com")
	}

	if err := SetConfigValue(&cfg, "token", "abc"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Token != "abc" {
		t.Errorf("Token = %q, want %q", cfg.Token, "abc")
	}
}

func TestSetConfigValue_InvalidKey(t *testing.T) {
	var cfg Config
	err := SetConfigValue(&cfg, "nope", "val")
	if err == nil {
		t.Fatal("expected error for invalid key")
	}
}

func TestLoadConfig_InvalidYAML(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bad.yaml")
	if err := os.WriteFile(path, []byte(":::not yaml"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := LoadConfig(path)
	if err == nil {
		t.Fatal("expected error for invalid YAML")
	}
}
