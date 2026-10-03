package auth

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"html"
	"mime"
	"mime/multipart"
	"net"
	"net/smtp"
	"net/textproto"
	"strings"
	"time"

	"tarsgo-backend/config"
)

const defaultSMTPTimeout = 15 * time.Second

type Mailer interface {
	Send(ctx context.Context, to string, subject string, body string) error
}

type SMTPMailer struct {
	cfg config.SMTPConfig
}

func NewSMTPMailer(cfg config.SMTPConfig) *SMTPMailer {
	return &SMTPMailer{cfg: cfg}
}

func (m *SMTPMailer) Send(ctx context.Context, to string, subject string, body string) error {
	return m.send(ctx, to, buildMessage(m.cfg.From, to, subject, body))
}

func (m *SMTPMailer) SendWithInlineImage(ctx context.Context, to string, subject string, body string, image []byte, contentType string) error {
	if len(image) == 0 {
		return m.Send(ctx, to, subject, body)
	}
	message, err := buildInlineImageMessage(m.cfg.From, to, subject, body, image, contentType)
	if err != nil {
		return err
	}
	return m.send(ctx, to, message)
}

func (m *SMTPMailer) send(ctx context.Context, to string, message []byte) error {
	if strings.TrimSpace(m.cfg.Host) == "" || strings.TrimSpace(m.cfg.Username) == "" || strings.TrimSpace(m.cfg.Password) == "" || strings.TrimSpace(m.cfg.From) == "" {
		return fmt.Errorf("smtp config is incomplete")
	}

	ctx, cancel := ensureSMTPTimeout(ctx)
	defer cancel()

	address := net.JoinHostPort(m.cfg.Host, m.cfg.Port)
	conn, err := m.dial(ctx, address)
	if err != nil {
		return err
	}
	defer conn.Close()

	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}

	client, err := smtp.NewClient(conn, m.cfg.Host)
	if err != nil {
		return fmt.Errorf("create smtp client: %w", err)
	}

	closed := false
	defer func() {
		if !closed {
			_ = client.Close()
		}
	}()

	if strings.TrimSpace(m.cfg.Port) != "465" {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{
				ServerName: m.cfg.Host,
				MinVersion: tls.VersionTLS12,
			}); err != nil {
				return fmt.Errorf("smtp starttls: %w", err)
			}
		}
	}

	if ok, _ := client.Extension("AUTH"); ok {
		auth := smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}

	if err := client.Mail(m.cfg.From); err != nil {
		return fmt.Errorf("smtp set from: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp set recipient: %w", err)
	}

	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := writer.Write(message); err != nil {
		_ = writer.Close()
		return fmt.Errorf("smtp write message: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("smtp close writer: %w", err)
	}

	if err := client.Quit(); err != nil {
		return fmt.Errorf("smtp quit: %w", err)
	}
	closed = true

	return nil
}

func (m *SMTPMailer) dial(ctx context.Context, address string) (net.Conn, error) {
	if strings.TrimSpace(m.cfg.Port) == "465" {
		dialer := &tls.Dialer{
			NetDialer: &net.Dialer{},
			Config: &tls.Config{
				ServerName: m.cfg.Host,
				MinVersion: tls.VersionTLS12,
			},
		}

		conn, err := dialer.DialContext(ctx, "tcp", address)
		if err != nil {
			return nil, fmt.Errorf("dial smtp ssl server: %w", err)
		}
		return conn, nil
	}

	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, fmt.Errorf("dial smtp server: %w", err)
	}
	return conn, nil
}

func ensureSMTPTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if _, ok := ctx.Deadline(); ok {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, defaultSMTPTimeout)
}

func buildMessage(from string, to string, subject string, body string) []byte {
	headers := []string{
		fmt.Sprintf("From: %s", from),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", mime.QEncoding.Encode("UTF-8", subject)),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}

	return []byte(strings.Join(headers, "\r\n"))
}

func buildInlineImageMessage(from string, to string, subject string, body string, image []byte, contentType string) ([]byte, error) {
	contentType = strings.ToLower(strings.TrimSpace(contentType))
	if !strings.HasPrefix(contentType, "image/") {
		return nil, fmt.Errorf("inline attachment is not an image")
	}

	var payload bytes.Buffer
	related := multipart.NewWriter(&payload)
	payload.WriteString(fmt.Sprintf("From: %s\r\n", from))
	payload.WriteString(fmt.Sprintf("To: %s\r\n", to))
	payload.WriteString(fmt.Sprintf("Subject: %s\r\n", mime.QEncoding.Encode("UTF-8", subject)))
	payload.WriteString("MIME-Version: 1.0\r\n")
	payload.WriteString(fmt.Sprintf("Content-Type: multipart/related; boundary=%q\r\n\r\n", related.Boundary()))

	var alternativePayload bytes.Buffer
	alternative := multipart.NewWriter(&alternativePayload)
	plainHeader := make(textproto.MIMEHeader)
	plainHeader.Set("Content-Type", "text/plain; charset=UTF-8")
	plainHeader.Set("Content-Transfer-Encoding", "8bit")
	plainPart, err := alternative.CreatePart(plainHeader)
	if err != nil {
		return nil, fmt.Errorf("create plain email part: %w", err)
	}
	if _, err := plainPart.Write([]byte(body)); err != nil {
		return nil, fmt.Errorf("write plain email part: %w", err)
	}

	htmlHeader := make(textproto.MIMEHeader)
	htmlHeader.Set("Content-Type", "text/html; charset=UTF-8")
	htmlHeader.Set("Content-Transfer-Encoding", "8bit")
	htmlPart, err := alternative.CreatePart(htmlHeader)
	if err != nil {
		return nil, fmt.Errorf("create html email part: %w", err)
	}
	htmlBody := `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;font-size:15px;line-height:1.8;color:#202124">` + strings.ReplaceAll(html.EscapeString(body), "\n", "<br>") + `<div style="margin-top:24px"><p style="margin:0 0 12px">请使用 QQ 扫描下方图片加入录取群：</p><img src="cid:admission-group-image" alt="录取群二维码" style="display:block;max-width:360px;width:100%;height:auto"></div></div>`
	if _, err := htmlPart.Write([]byte(htmlBody)); err != nil {
		return nil, fmt.Errorf("write html email part: %w", err)
	}
	if err := alternative.Close(); err != nil {
		return nil, fmt.Errorf("close alternative email part: %w", err)
	}

	alternativeHeader := make(textproto.MIMEHeader)
	alternativeHeader.Set("Content-Type", fmt.Sprintf("multipart/alternative; boundary=%q", alternative.Boundary()))
	alternativePart, err := related.CreatePart(alternativeHeader)
	if err != nil {
		return nil, fmt.Errorf("create alternative email part: %w", err)
	}
	if _, err := alternativePart.Write(alternativePayload.Bytes()); err != nil {
		return nil, fmt.Errorf("write alternative email part: %w", err)
	}

	imageHeader := make(textproto.MIMEHeader)
	imageHeader.Set("Content-Type", contentType)
	imageHeader.Set("Content-Transfer-Encoding", "base64")
	imageHeader.Set("Content-ID", "<admission-group-image>")
	imageHeader.Set("Content-Disposition", "inline")
	imagePart, err := related.CreatePart(imageHeader)
	if err != nil {
		return nil, fmt.Errorf("create inline image part: %w", err)
	}
	encoder := base64.NewEncoder(base64.StdEncoding, imagePart)
	if _, err := encoder.Write(image); err != nil {
		return nil, fmt.Errorf("encode inline image: %w", err)
	}
	if err := encoder.Close(); err != nil {
		return nil, fmt.Errorf("close inline image encoder: %w", err)
	}
	if err := related.Close(); err != nil {
		return nil, fmt.Errorf("close related email: %w", err)
	}
	return payload.Bytes(), nil
}
