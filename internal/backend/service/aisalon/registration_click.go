package aisalon

import (
	"context"
	"net/url"
	"regexp"
	"strings"

	"gorm.io/gorm"
	"tarsgo-backend/model"
)

// Match the standalone lead action supported by the public Markdown renderer.
var registrationActionPattern = regexp.MustCompile(`^\[([^\]\r\n]+)\]\((https://[^\s)]+)\)[ \t]*(\r?\n[ \t]*\r?\n|$)`)

func hasRegistrationAction(summary string) bool {
	match := registrationActionPattern.FindStringSubmatch(strings.TrimLeft(summary, " \t\r\n\v\f\u00a0\ufeff"))
	if match == nil || strings.TrimSpace(match[1]) == "" {
		return false
	}
	u, err := url.Parse(match[2])
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil
}

func (s *Service) RegistrationClick(ctx context.Context, id uint64) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		e, err := lockedEvent(tx, id)
		if err != nil {
			return err
		}
		if !e.Published || !e.Online || !hasRegistrationAction(e.Summary) {
			return gorm.ErrRecordNotFound
		}
		// Use the same event lock as editing, and preserve its content timestamp.
		return tx.Model(&model.AISalonEvent{}).Where("id = ?", id).
			UpdateColumn("registration_clicks", gorm.Expr("registration_clicks + 1")).Error
	})
}
