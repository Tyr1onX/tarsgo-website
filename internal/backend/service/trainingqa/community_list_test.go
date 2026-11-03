package trainingqa

import (
	"context"
	"encoding/json"
	"gorm.io/gorm"
	"strings"
	"tarsgo-backend/model"
	"testing"
	"time"
)

func TestCommunityListProjectionExcludesDetailAndLatestHotWork(t *testing.T) {
	for _, hot := range []bool{false, true} {
		db, mock := newQuestionMockGorm(t)
		expectMemberGroups(mock, 22, 41)
		service := &Service{db: db, now: time.Now}
		query, err := service.communityListQuery(context.Background(), Actor{ID: 22, RoleName: model.RoleNameUser}, hot)
		if err != nil {
			t.Fatal(err)
		}
		var rows []communityPostRow
		sql := query.Session(&gorm.Session{DryRun: true}).Find(&rows).Statement.SQL.String()
		for _, excluded := range []string{"q.*", "q.body", "author_name", "author_avatar", "author_team_identity_status"} {
			if strings.Contains(sql, excluded) {
				t.Fatalf("list overfetches %s: %s", excluded, sql)
			}
		}
		if strings.Contains(sql, "recent_interactions") != hot {
			t.Fatalf("hot aggregate mismatch: %s", sql)
		}
		if !strings.Contains(sql, "q.visibility") || !strings.Contains(sql, "q.asker_id") {
			t.Fatal("visibility scope missing")
		}
	}
	data, err := json.Marshal(CommunityListItem{})
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{`"body"`, `"attachments"`, `"authorLevel"`, `"authorPositions"`} {
		if strings.Contains(string(data), key) {
			t.Fatalf("detail data in list: %s", data)
		}
	}
}
