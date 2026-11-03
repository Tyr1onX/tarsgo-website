package cobuilderbadge

import (
	"sort"
	"time"

	"tarsgo-backend/model"
)

// PublicBadge is the current earned badge shown on community member pages.
// Contribution history and administrative identities stay in the admin API.
type PublicBadge struct {
	Key         string     `json:"key"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	LevelCode   string     `json:"levelCode"`
	LevelLabel  string     `json:"levelLabel"`
	IsEarned    bool       `json:"isEarned"`
	EarnedAt    *time.Time `json:"earnedAt,omitempty"`
}

type badgeEvent struct {
	at      time.Time
	grant   bool
	orderID uint64
}

// PublicBadgeFromContributions derives the public badge state from the same
// contribution records used by badge administration and unlock notifications.
func PublicBadgeFromContributions(records []model.CoBuilderContribution) *PublicBadge {
	summary := summarize(records)
	public := &PublicBadge{
		Key: "co_builder", Name: summary.Name,
		Description: "记录成员为吉甲社区作出的共建贡献。",
		LevelCode:   summary.LevelCode,
		LevelLabel:  summary.LevelLabel, IsEarned: summary.LevelCode != "none",
	}
	if !public.IsEarned {
		return nil
	}

	ordered := append([]model.CoBuilderContribution(nil), records...)
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].CreatedAt.Equal(ordered[j].CreatedAt) {
			return ordered[i].ID < ordered[j].ID
		}
		return ordered[i].CreatedAt.Before(ordered[j].CreatedAt)
	})
	events := make([]badgeEvent, 0, len(ordered)*2)
	for _, record := range ordered {
		events = append(events, badgeEvent{at: record.CreatedAt, grant: true, orderID: record.ID})
		if record.RevokedAt != nil && !record.RevokedAt.Before(record.CreatedAt) {
			events = append(events, badgeEvent{at: *record.RevokedAt, orderID: record.ID})
		}
	}
	sort.SliceStable(events, func(i, j int) bool {
		if events[i].at.Equal(events[j].at) {
			if events[i].grant != events[j].grant {
				return events[i].grant
			}
			return events[i].orderID < events[j].orderID
		}
		return events[i].at.Before(events[j].at)
	})
	earnedAt := make(map[string]time.Time)
	count := 0
	for _, event := range events {
		before := publicTierForCount(count)
		if event.grant {
			count++
		} else if count > 0 {
			count--
		}
		after := publicTierForCount(count)
		if before == after {
			continue
		}
		if tierRank(after) > tierRank(before) {
			earnedAt[after] = event.at
		} else {
			delete(earnedAt, before)
		}
	}
	if date, ok := earnedAt[public.LevelCode]; ok && !date.IsZero() {
		public.EarnedAt = &date
	}

	return public
}

func publicTierForCount(count int) string {
	if current := currentTier(count); current != nil {
		return current.code
	}
	return "none"
}

func tierRank(code string) int {
	for index := range tiers {
		if tiers[index].code == code {
			return index + 1
		}
	}
	return 0
}
