package auth

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

type tokenHeader struct {
	Algorithm string `json:"alg"`
	Type      string `json:"typ"`
}

func SignToken(secret string, claims Claims) (string, error) {
	headerJSON, err := json.Marshal(tokenHeader{
		Algorithm: "HS256",
		Type:      "JWT",
	})
	if err != nil {
		return "", fmt.Errorf("marshal token header: %w", err)
	}

	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("marshal token claims: %w", err)
	}

	headerEncoded := encodeSegment(headerJSON)
	claimsEncoded := encodeSegment(claimsJSON)
	signingInput := headerEncoded + "." + claimsEncoded

	signature, err := signHS256(signingInput, secret)
	if err != nil {
		return "", err
	}

	return signingInput + "." + signature, nil
}

func TestSignAndParseToken(t *testing.T) {
	t.Parallel()

	token, err := SignToken("secret", Claims{
		Subject:   "42",
		Email:     "admin@tarsgo.local",
		Role:      "super_admin",
		IssuedAt:  time.Now().Unix(),
		ExpiresAt: time.Now().Add(time.Hour).Unix(),
	})
	if err != nil {
		t.Fatalf("SignToken() error = %v", err)
	}

	claims, err := ParseToken("secret", token)
	if err != nil {
		t.Fatalf("ParseToken() error = %v", err)
	}

	if claims.Subject != "42" {
		t.Fatalf("unexpected subject: %s", claims.Subject)
	}
	if claims.Email != "admin@tarsgo.local" {
		t.Fatalf("unexpected email: %s", claims.Email)
	}
}

func TestParseTokenExpired(t *testing.T) {
	t.Parallel()

	token, err := SignToken("secret", Claims{
		Subject:   "42",
		ExpiresAt: time.Now().Add(-time.Minute).Unix(),
		IssuedAt:  time.Now().Add(-2 * time.Minute).Unix(),
	})
	if err != nil {
		t.Fatalf("SignToken() error = %v", err)
	}

	_, err = ParseToken("secret", token)
	if !errors.Is(err, ErrTokenExpired) {
		t.Fatalf("expected ErrTokenExpired, got %v", err)
	}
}

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
