package internal

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Config struct {
	APIUrl string `yaml:"api_url"`
	Token  string `yaml:"token"`
}

func DefaultConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join("~", ".devtrack", "config.yaml")
	}
	return filepath.Join(home, ".devtrack", "config.yaml")
}

func LoadConfig(path string) (Config, error) {
	var cfg Config
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return cfg, nil
	}
	if err != nil {
		return cfg, fmt.Errorf("read config: %w", err)
	}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("parse config: %w", err)
	}
	return cfg, nil
}

func SaveConfig(path string, cfg Config) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	data, err := yaml.Marshal(&cfg)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	return nil
}

var validConfigKeys = map[string]bool{
	"api_url": true,
	"token":   true,
}

func GetConfigValue(cfg Config, key string) (string, error) {
	if !validConfigKeys[key] {
		return "", fmt.Errorf("unknown config key: %q (valid keys: api_url, token)", key)
	}
	switch key {
	case "api_url":
		return cfg.APIUrl, nil
	case "token":
		return cfg.Token, nil
	}
	return "", nil
}

func SetConfigValue(cfg *Config, key, value string) error {
	if !validConfigKeys[key] {
		return fmt.Errorf("unknown config key: %q (valid keys: api_url, token)", key)
	}
	switch key {
	case "api_url":
		cfg.APIUrl = value
	case "token":
		cfg.Token = value
	}
	return nil
}
