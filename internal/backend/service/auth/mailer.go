package auth

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
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
	if strings.TrimSpace(m.cfg.Host) == "" || strings.TrimSpace(m.cfg.Username) == "" || strings.TrimSpace(m.cfg.Password) == "" || strings.TrimSpace(m.cfg.From) == "" {
		return fmt.Errorf("smtp config is incomplete")
	}

	ctx, cancel := ensureSMTPTimeout(ctx)
	defer cancel()

	message := buildMessage(m.cfg.From, to, subject, body)
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
		fmt.Sprintf("Subject: %s", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}

	return []byte(strings.Join(headers, "\r\n"))
}
