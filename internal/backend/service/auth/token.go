package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
)

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
