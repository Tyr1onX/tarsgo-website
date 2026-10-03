package auth

import (
	"bytes"
	"encoding/base64"
	"io"
	"mime"
	"mime/multipart"
	"net/mail"
	"strings"
	"testing"
)

func TestBuildInlineImageMessageCreatesRelatedCIDImage(t *testing.T) {
	image := []byte("test-image-content")
	raw, err := buildInlineImageMessage("sender@example.com", "member@example.com", "录取通知", "恭喜录取", image, "image/png")
	if err != nil {
		t.Fatalf("buildInlineImageMessage returned error: %v", err)
	}

	message, err := mail.ReadMessage(bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("parse message: %v", err)
	}
	mediaType, params, err := mime.ParseMediaType(message.Header.Get("Content-Type"))
	if err != nil || mediaType != "multipart/related" {
		t.Fatalf("expected multipart/related, got %q params=%v err=%v", mediaType, params, err)
	}
	related := multipart.NewReader(message.Body, params["boundary"])

	alternativePart, err := related.NextPart()
	if err != nil {
		t.Fatalf("read alternative part: %v", err)
	}
	alternativeType, alternativeParams, err := mime.ParseMediaType(alternativePart.Header.Get("Content-Type"))
	if err != nil || alternativeType != "multipart/alternative" {
		t.Fatalf("expected multipart/alternative, got %q params=%v err=%v", alternativeType, alternativeParams, err)
	}
	alternative := multipart.NewReader(alternativePart, alternativeParams["boundary"])
	if _, err := alternative.NextPart(); err != nil {
		t.Fatalf("read plain part: %v", err)
	}
	htmlPart, err := alternative.NextPart()
	if err != nil {
		t.Fatalf("read html part: %v", err)
	}
	htmlBody, err := io.ReadAll(htmlPart)
	if err != nil {
		t.Fatalf("read html body: %v", err)
	}
	if !strings.Contains(string(htmlBody), `src="cid:admission-group-image"`) {
		t.Fatalf("html body does not reference CID image: %s", htmlBody)
	}

	imagePart, err := related.NextPart()
	if err != nil {
		t.Fatalf("read image part: %v", err)
	}
	if imagePart.Header.Get("Content-ID") != "<admission-group-image>" || imagePart.Header.Get("Content-Disposition") != "inline" {
		t.Fatalf("unexpected inline image headers: %#v", imagePart.Header)
	}
	decoded, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, imagePart))
	if err != nil {
		t.Fatalf("read decoded image: %v", err)
	}
	if !bytes.Equal(decoded, image) {
		t.Fatalf("decoded image differs: got %q want %q", decoded, image)
	}
}
