package cobuilderbadge

import (
	"sort"
	"time"

	"tarsgo-backend/model"
)

// PublicBadge is the privacy-safe projection used by community member pages.
// It deliberately omits contribution IDs and the identities of grantors and
// revokers, which remain available only to badge administrators.
type PublicBadge struct {
	Key           string                    `json:"key"`
	Name          string                    `json:"name"`
	Description   string                    `json:"description"`
	Condition     string                    `json:"condition"`
	LevelCode     string                    `json:"levelCode"`
	LevelLabel    string                    `json:"levelLabel"`
	IsEarned      bool                      `json:"isEarned"`
	EarnedAt      *time.Time                `json:"earnedAt,omitempty"`
	TierHistory   []PublicBadgeTier         `json:"tierHistory"`
	Contributions []PublicBadgeContribution `json:"contributions"`
}

type PublicBadgeTier struct {
	LevelCode                 string     `json:"levelCode"`
	LevelLabel                string     `json:"levelLabel"`
	RequiredContributionCount int        `json:"requiredContributionCount"`
	EarnedAt                  time.Time  `json:"earnedAt"`
	RevokedAt                 *time.Time `json:"revokedAt,omitempty"`
}

type PublicBadgeContribution struct {
	Description string     `json:"description"`
	CreatedAt   time.Time  `json:"createdAt"`
	RevokedAt   *time.Time `json:"revokedAt,omitempty"`
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
		Condition:   "管理员根据可核对的贡献记录授予，累计有效贡献决定当前等级。",
		LevelCode:   summary.LevelCode,
		LevelLabel:  summary.LevelLabel, IsEarned: summary.LevelCode != "none",
		TierHistory: []PublicBadgeTier{}, Contributions: make([]PublicBadgeContribution, 0, len(records)),
	}
	if !public.IsEarned && len(records) == 0 {
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
		public.Contributions = append(public.Contributions, PublicBadgeContribution{
			Description: record.Description, CreatedAt: record.CreatedAt, RevokedAt: record.RevokedAt,
		})
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
	activeTiers := make(map[string]int)
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
			level := findTier(after)
			if level == nil {
				continue
			}
			public.TierHistory = append(public.TierHistory, PublicBadgeTier{
				LevelCode: level.code, LevelLabel: level.label, RequiredContributionCount: level.threshold, EarnedAt: event.at,
			})
			activeTiers[after] = len(public.TierHistory) - 1
			if after == public.LevelCode {
				date := event.at
				public.EarnedAt = &date
			}
		} else if index, ok := activeTiers[before]; ok {
			revokedAt := event.at
			public.TierHistory[index].RevokedAt = &revokedAt
			delete(activeTiers, before)
		}
	}
	if public.IsEarned && public.EarnedAt == nil {
		// Records can be imported with incomplete timestamps; retain a stable
		// current tier while leaving its date absent rather than inventing one.
		for index := len(public.TierHistory) - 1; index >= 0; index-- {
			if public.TierHistory[index].LevelCode == public.LevelCode && public.TierHistory[index].RevokedAt == nil {
				date := public.TierHistory[index].EarnedAt
				public.EarnedAt = &date
				break
			}
		}
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

func findTier(code string) *tier {
	for index := range tiers {
		if tiers[index].code == code {
			return &tiers[index]
		}
	}
	return nil
}
