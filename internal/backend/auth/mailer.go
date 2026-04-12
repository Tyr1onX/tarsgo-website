package auth

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"

	"tarsgo-backend/config"
)

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
	message := buildMessage(m.cfg.From, to, subject, body)
	address := net.JoinHostPort(m.cfg.Host, m.cfg.Port)

	if m.cfg.Port == "465" {
		dialer := &tls.Dialer{
			Config: &tls.Config{
				ServerName: m.cfg.Host,
				MinVersion: tls.VersionTLS12,
			},
		}

		conn, err := dialer.DialContext(ctx, "tcp", address)
		if err != nil {
			return fmt.Errorf("dial smtp ssl server: %w", err)
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, m.cfg.Host)
		if err != nil {
			return fmt.Errorf("create smtp client: %w", err)
		}
		defer client.Quit()

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

		return nil
	}

	auth := smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)
	if err := smtp.SendMail(address, auth, m.cfg.From, []string{to}, message); err != nil {
		return fmt.Errorf("send smtp mail: %w", err)
	}

	return nil
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
