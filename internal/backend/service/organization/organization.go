package organization

import (
	"encoding/json"
	"sync"
)

type Position struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	Name      string  `json:"name"`
	UserID    *uint64 `json:"userId"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}

type Category struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Positions []Position `json:"positions"`
}

type Preview struct {
	Team struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	} `json:"team"`
	Leader     Position   `json:"leader"`
	Categories []Category `json:"categories"`
}

type MemberPosition struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	CategoryID    string `json:"categoryId"`
	CategoryTitle string `json:"categoryTitle"`
}

const organizationPreviewJSON = `{
  "team": {"id": "team", "title": "吉甲大师战队"},
  "leader": {"id": "captain", "title": "队长", "name": "镇沈晖", "userId": 643},
  "categories": [
    {
      "id": "management",
      "title": "核心管理层",
      "positions": [
        {"id": "vice-captain-project", "title": "副队长（项目管理）", "name": "吉荣昌", "userId": 641},
        {"id": "project-management", "title": "项目管理", "name": "孙煦朝", "userId": null},
        {"id": "vice-captain-training", "title": "副队长（人员培养、校内赛、参观接待）", "name": "高畅", "userId": 694},
        {"id": "operations-manager", "title": "运营经理", "name": "童逸创", "userId": 323},
        {"id": "vice-captain-test-safety", "title": "副队长（测试、安全卫生、战术、操作手）", "name": "姜昊阳", "userId": 647}
      ]
    },
    {
      "id": "technical",
      "title": "技术体系",
      "positions": [
        {"id": "vision-lead", "title": "视觉组长", "name": "张育宁", "userId": 5},
        {"id": "mechanical-lead", "title": "机械组长", "name": "沈桂清", "userId": 655},
        {"id": "ai-lead", "title": "AI 组长", "name": "白航铭", "userId": 670},
        {"id": "electrical-lead", "title": "电控组长", "name": "待确认", "userId": null}
      ]
    },
    {
      "id": "robot-classes",
      "title": "兵种项目体系",
      "positions": [
        {"id": "sentry-lead", "title": "哨兵组长", "name": "张坤杰", "userId": 24},
        {"id": "infantry-lead", "title": "步兵组长", "name": "雷韶冉", "userId": 644},
        {"id": "dart-lead", "title": "飞镖组长", "name": "曲佳响", "userId": 10},
        {"id": "heavy-lead", "title": "重装组长", "name": "陆广鹏", "userId": 631},
        {"id": "aerial-lead", "title": "飞机组长", "name": "王彬赫", "userId": 22},
        {"id": "radar-station", "title": "雷达站负责人", "name": "左文添", "userId": 630}
      ]
    }
  ]
}`

var (
	organizationDataOnce sync.Once
	organizationData     Preview
)

func basePreview() Preview {
	organizationDataOnce.Do(func() {
		if err := json.Unmarshal([]byte(organizationPreviewJSON), &organizationData); err != nil {
			panic("invalid static organization data: " + err.Error())
		}
	})
	return organizationData
}

// PreviewData returns a copy so request-specific account data cannot mutate the
// shared position definitions.
func PreviewData() Preview {
	preview := basePreview()
	preview.Leader = clonePosition(preview.Leader)
	preview.Categories = append([]Category(nil), preview.Categories...)
	for index := range preview.Categories {
		preview.Categories[index].Positions = append([]Position(nil), preview.Categories[index].Positions...)
		for positionIndex := range preview.Categories[index].Positions {
			preview.Categories[index].Positions[positionIndex] = clonePosition(preview.Categories[index].Positions[positionIndex])
		}
	}
	return preview
}

func clonePosition(position Position) Position {
	if position.UserID != nil {
		userID := *position.UserID
		position.UserID = &userID
	}
	if position.AvatarURL != nil {
		avatarURL := *position.AvatarURL
		position.AvatarURL = &avatarURL
	}
	return position
}

// MemberPositions exposes only the current member's own team titles.
func MemberPositions(userID uint64) []MemberPosition {
	positions := make([]MemberPosition, 0, 1)
	if userID == 0 {
		return positions
	}

	preview := basePreview()
	appendPosition := func(position Position, categoryID, categoryTitle string) {
		if position.UserID != nil && *position.UserID == userID {
			positions = append(positions, MemberPosition{
				ID:            position.ID,
				Title:         position.Title,
				CategoryID:    categoryID,
				CategoryTitle: categoryTitle,
			})
		}
	}
	appendPosition(preview.Leader, "management", "核心管理层")
	for _, category := range preview.Categories {
		for _, position := range category.Positions {
			appendPosition(position, category.ID, category.Title)
		}
	}
	return positions
}
