package leave

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

const defaultDailyCutoff = "11:30"

func dailyCutoffFromEnv() (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv("LEAVE_DAILY_CUTOFF"))
	if value == "" {
		value = defaultDailyCutoff
	}
	parsed, err := time.Parse("15:04", value)
	if err != nil {
		return 0, fmt.Errorf("LEAVE_DAILY_CUTOFF must use HH:MM: %w", err)
	}
	return time.Duration(parsed.Hour())*time.Hour + time.Duration(parsed.Minute())*time.Minute, nil
}

func shouldCollectDailyLeave(now time.Time, cutoff time.Duration, lastRunDate string) bool {
	local := now.In(shanghai)
	currentTime := time.Duration(local.Hour())*time.Hour + time.Duration(local.Minute())*time.Minute
	if currentTime < cutoff {
		return false
	}
	return local.Format("2006-01-02") != lastRunDate
}

// StartDailyCollection runs the same transaction used by the admin action once
// per Shanghai day after the configured cutoff. Repeated calls are harmless:
// the collector only freezes requests that are still pending.
func StartDailyCollection(ctx context.Context, service *Service) {
	cutoff, err := dailyCutoffFromEnv()
	if err != nil {
		log.Printf("daily school leave collection disabled: %v", err)
		return
	}
	log.Printf("daily school leave collection scheduled for %02d:%02d Asia/Shanghai", int(cutoff/time.Hour), int(cutoff/time.Minute)%60)
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		lastRunDate := ""
		collectIfDue := func(now time.Time) {
			local := now.In(shanghai)
			if !shouldCollectDailyLeave(local, cutoff, lastRunDate) {
				return
			}
			if err := service.CollectDaily(ctx); err != nil {
				log.Printf("scheduled school leave collection failed: %v", err)
				return
			}
			lastRunDate = local.Format("2006-01-02")
		}
		collectIfDue(time.Now())
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				collectIfDue(now)
			}
		}
	}()
}
