package middleware

import "testing"

func TestSafeActivityMetadataDropsSensitiveAndLargeValues(t *testing.T) {
	result := safeActivityMetadata(map[string]any{"decision": "approve", "password": "secret", "jwtToken": "token", "requestBody": "full body", "announcementContent": "private", "fileName": "resume.pdf", "count": 2, "nested": map[string]any{"secret": true}})
	if result["decision"] != "approve" || result["count"] != 2 {
		t.Fatalf("safe values missing: %#v", result)
	}
	for _, key := range []string{"password", "jwtToken", "requestBody", "announcementContent", "fileName", "nested"} {
		if _, ok := result[key]; ok {
			t.Fatalf("sensitive key retained: %s", key)
		}
	}
}
