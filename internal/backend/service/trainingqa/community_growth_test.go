package trainingqa

import "testing"

func TestCommunityLevelThresholds(t *testing.T) {
	for _, test := range []struct {
		xp    int64
		level int
	}{
		{xp: 0, level: 1},
		{xp: 99, level: 1},
		{xp: 100, level: 2},
		{xp: 399, level: 2},
		{xp: 400, level: 3},
		{xp: 899, level: 3},
		{xp: 900, level: 4},
		{xp: 8100, level: 10},
	} {
		if got := CommunityLevelForXP(test.xp); got != test.level {
			t.Errorf("CommunityLevelForXP(%d) = %d, want %d", test.xp, got, test.level)
		}
	}
}

func TestCommunityCheckInRewardSchedule(t *testing.T) {
	for _, test := range []struct {
		day int
		xp  int
	}{
		{day: 1, xp: 10},
		{day: 2, xp: 10},
		{day: 3, xp: 12},
		{day: 6, xp: 12},
		{day: 7, xp: 15},
		{day: 365, xp: 15},
	} {
		if got := communityCheckInXP(test.day); got != test.xp {
			t.Errorf("communityCheckInXP(%d) = %d, want %d", test.day, got, test.xp)
		}
	}
}
