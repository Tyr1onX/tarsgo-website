package trainingqa

import (
	"mime/multipart"
	"strings"
	"testing"
)

func TestValidateCommunityUploadBindings(t *testing.T) {
	file := &multipart.FileHeader{Filename: "diagram.png"}
	validBody := "Intro\n\n![diagram](community-upload://12345678-1234-1234-1234-123456789abc)"
	validToken := "12345678-1234-1234-1234-123456789abc"
	tests := []struct {
		name    string
		body    string
		files   []*multipart.FileHeader
		tokens  []string
		wantErr bool
	}{
		{name: "matching inline image", body: validBody, files: []*multipart.FileHeader{file}, tokens: []string{validToken}},
		{name: "matching inline image title", body: "![diagram](community-upload://" + validToken + " \"caption\")", files: []*multipart.FileHeader{file}, tokens: []string{validToken}},
		{name: "legacy standalone attachment", body: "An older attachment", files: []*multipart.FileHeader{file}},
		{name: "persisted image URL", body: "![diagram](/api/community/files/42)", files: []*multipart.FileHeader{file}},
		{name: "remote image URL", body: "![diagram](https://example.com/diagram.png)"},
		{name: "unknown temporary image", body: strings.ReplaceAll(validBody, validToken, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), files: []*multipart.FileHeader{file}, tokens: []string{validToken}, wantErr: true},
		{name: "missing upload", body: validBody, wantErr: true},
		{name: "token has no file", body: validBody, tokens: []string{validToken}, wantErr: true},
		{name: "duplicate token", body: validBody, files: []*multipart.FileHeader{file, file}, tokens: []string{validToken, validToken}, wantErr: true},
		{name: "duplicate body reference", body: validBody + "\n\n" + validBody, files: []*multipart.FileHeader{file}, tokens: []string{validToken}, wantErr: true},
		{name: "temporary token outside image", body: "community-upload://" + validToken, files: []*multipart.FileHeader{file}, tokens: []string{validToken}, wantErr: true},
		{name: "malformed token", body: "![bad](community-upload://short)", files: []*multipart.FileHeader{file}, tokens: []string{validToken}, wantErr: true},
		{name: "unused token", body: "plain text", files: []*multipart.FileHeader{file}, tokens: []string{validToken}, wantErr: true},
		{name: "blob image URL rejected", body: "![diagram](blob:https://example.test/temporary)", wantErr: true},
		{name: "data image URL rejected", body: "![diagram](data:image/png;base64,AAAA)", wantErr: true},
		{name: "file image URL rejected", body: "![diagram](file:///tmp/diagram.png)", wantErr: true},
		{name: "HTML blob image URL rejected", body: `<img src="blob:https://example.test/temporary">`, wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateCommunityUploadBindings(test.body, test.files, test.tokens)
			if (err != nil) != test.wantErr {
				t.Fatalf("validateCommunityUploadBindings() error = %v, wantErr %v", err, test.wantErr)
			}
		})
	}
}

func TestReplaceCommunityUploadTokens(t *testing.T) {
	token := "12345678-1234-1234-1234-123456789abc"
	body := "说明\n\n![架构](community-upload://" + token + " \"系统图\")"
	want := "说明\n\n![架构](/api/community/files/42 \"系统图\")"
	got, err := replaceCommunityUploadTokens(body, map[string]string{token: "/api/community/files/42"})
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("replaceCommunityUploadTokens() = %q, want %q", got, want)
	}
	if _, err := replaceCommunityUploadTokens(body, nil); err == nil {
		t.Fatal("expected an unresolved upload token to be rejected")
	}
}
