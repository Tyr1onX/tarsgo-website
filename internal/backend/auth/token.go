package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrTokenFormat  = errors.New("invalid token format")
	ErrTokenExpired = errors.New("token expired")
	ErrTokenInvalid = errors.New("token invalid")
)

type Claims struct {
	Subject   string `json:"sub"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	ExpiresAt int64  `json:"exp"`
	IssuedAt  int64  `json:"iat"`
}

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

func ParseToken(secret string, token string) (*Claims, error) {
	segments := strings.Split(token, ".")
	if len(segments) != 3 {
		return nil, ErrTokenFormat
	}

	signingInput := segments[0] + "." + segments[1]
	expectedSignature, err := signHS256(signingInput, secret)
	if err != nil {
		return nil, err
	}
	if !hmac.Equal([]byte(expectedSignature), []byte(segments[2])) {
		return nil, ErrTokenInvalid
	}

	payload, err := decodeSegment(segments[1])
	if err != nil {
		return nil, ErrTokenInvalid
	}

	var claims Claims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, ErrTokenInvalid
	}
	if claims.Subject == "" || claims.ExpiresAt == 0 {
		return nil, ErrTokenInvalid
	}
	if time.Now().Unix() >= claims.ExpiresAt {
		return nil, ErrTokenExpired
	}

	return &claims, nil
}

func GenerateRandomString(length int) (string, error) {
	if length <= 0 {
		return "", nil
	}

	buffer := make([]byte, length)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("read random bytes: %w", err)
	}

	return hex.EncodeToString(buffer)[:length], nil
}

func HashVerificationCode(email string, purpose string, code string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(email)) + ":" + purpose + ":" + code))
	return hex.EncodeToString(sum[:])
}

func encodeSegment(payload []byte) string {
	return base64.RawURLEncoding.EncodeToString(payload)
}

func decodeSegment(value string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(value)
}

func signHS256(signingInput string, secret string) (string, error) {
	mac := hmac.New(sha256.New, []byte(secret))
	if _, err := mac.Write([]byte(signingInput)); err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return encodeSegment(mac.Sum(nil)), nil
}
