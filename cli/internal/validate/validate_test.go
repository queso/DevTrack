package validate

import (
	"strings"
	"testing"
)

func TestEnum_EmptyValue_ReturnsNil(t *testing.T) {
	// An empty string means the flag was not set; Enum must return nil.
	err := Enum("status", "", []string{"open", "closed", "merged"})
	if err != nil {
		t.Errorf("expected nil for empty value, got %v", err)
	}
}

func TestEnum_ValidValue_ReturnsNil(t *testing.T) {
	for _, val := range []string{"open", "closed", "merged"} {
		err := Enum("status", val, []string{"open", "closed", "merged"})
		if err != nil {
			t.Errorf("expected nil for valid value %q, got %v", val, err)
		}
	}
}

func TestEnum_InvalidValue_ReturnsError(t *testing.T) {
	err := Enum("status", "unknown", []string{"open", "closed", "merged"})
	if err == nil {
		t.Fatal("expected error for invalid value, got nil")
	}
}

func TestEnum_ErrorMessage_ContainsFlagName(t *testing.T) {
	err := Enum("status", "bad", []string{"open", "closed"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "status") {
		t.Errorf("error message %q does not contain flag name %q", err.Error(), "status")
	}
}

func TestEnum_ErrorMessage_ContainsAllowedValues(t *testing.T) {
	allowed := []string{"open", "closed", "merged"}
	err := Enum("status", "bad", allowed)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	for _, v := range allowed {
		if !strings.Contains(err.Error(), v) {
			t.Errorf("error message %q does not contain allowed value %q", err.Error(), v)
		}
	}
}

func TestEnum_ErrorMessage_ContainsInvalidValue(t *testing.T) {
	err := Enum("status", "bad-value", []string{"open", "closed"})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "bad-value") {
		t.Errorf("error message %q does not contain the invalid value %q", err.Error(), "bad-value")
	}
}
