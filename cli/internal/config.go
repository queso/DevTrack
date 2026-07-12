package internal

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Config struct {
	APIUrl             string `yaml:"api_url"`
	Token              string `yaml:"token"`
	AccessClientID     string `yaml:"access_client_id,omitempty"`
	AccessClientSecret string `yaml:"access_client_secret,omitempty"`
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

const validConfigKeyList = "api_url, token, access_client_id, access_client_secret"

var validConfigKeys = map[string]bool{
	"api_url":              true,
	"token":                true,
	"access_client_id":     true,
	"access_client_secret": true,
}

func GetConfigValue(cfg Config, key string) (string, error) {
	if !validConfigKeys[key] {
		return "", fmt.Errorf("unknown config key: %q (valid keys: %s)", key, validConfigKeyList)
	}
	switch key {
	case "api_url":
		return cfg.APIUrl, nil
	case "token":
		return cfg.Token, nil
	case "access_client_id":
		return cfg.AccessClientID, nil
	case "access_client_secret":
		return cfg.AccessClientSecret, nil
	}
	return "", nil
}

func SetConfigValue(cfg *Config, key, value string) error {
	if !validConfigKeys[key] {
		return fmt.Errorf("unknown config key: %q (valid keys: %s)", key, validConfigKeyList)
	}
	switch key {
	case "api_url":
		cfg.APIUrl = value
	case "token":
		cfg.Token = value
	case "access_client_id":
		cfg.AccessClientID = value
	case "access_client_secret":
		cfg.AccessClientSecret = value
	}
	return nil
}
