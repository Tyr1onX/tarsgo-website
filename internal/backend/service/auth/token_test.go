package auth

import (
	"strings"
	"testing"
)

func TestGenerateNumericCode(t *testing.T) {
	t.Parallel()

	code, err := GenerateNumericCode(6)
	if err != nil {
		t.Fatalf("GenerateNumericCode() error = %v", err)
	}
	if len(code) != 6 {
		t.Fatalf("expected code length 6, got %d", len(code))
	}
	if strings.Trim(code, "0123456789") == "" {
		return
	}

	t.Fatalf("expected numeric code, got %s", code)
}
