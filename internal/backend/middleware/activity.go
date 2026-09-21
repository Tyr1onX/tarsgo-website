package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"tarsgo-backend/model"
)

const activityRecorderContextKey = "activityRecorder"

type ActivityInput struct {
	ActionKey    string
	ActorID      *uint64
	TargetUserID *uint64
	EntityType   string
	EntityID     uint64
	GroupID      *uint64
	Metadata     map[string]any
}

type activityRecorder struct{ db *gorm.DB }

func AttachBusinessActivityRecorder(db *gorm.DB) gin.HandlerFunc {
	recorder := &activityRecorder{db: db}
	return func(c *gin.Context) {
		c.Set(activityRecorderContextKey, recorder)
		c.Next()
	}
}

func RecordBusinessActivity(c *gin.Context, input ActivityInput) error {
	value, ok := c.Get(activityRecorderContextKey)
	if !ok {
		return nil
	}
	recorder, ok := value.(*activityRecorder)
	if !ok || recorder == nil || recorder.db == nil {
		return nil
	}
	actorID := input.ActorID
	if actorID == nil {
		if user, exists := CurrentSessionUser(c); exists && user != nil && user.ID != 0 {
			actorID = &user.ID
		}
	}
	var entityType *string
	if trimmed := strings.TrimSpace(input.EntityType); trimmed != "" {
		entityType = &trimmed
	}
	var entityID *uint64
	if input.EntityID != 0 {
		entityID = &input.EntityID
	}
	return recorder.db.WithContext(c.Request.Context()).Create(&model.ActivityEvent{ActionKey: input.ActionKey, ActorID: actorID, TargetUserID: input.TargetUserID, EntityType: entityType, EntityID: entityID, GroupID: input.GroupID, Metadata: safeActivityMetadata(input.Metadata)}).Error
}

func safeActivityMetadata(metadata map[string]any) map[string]any {
	if len(metadata) == 0 {
		return map[string]any{}
	}
	result := make(map[string]any)
	for key, value := range metadata {
		lower := strings.ToLower(strings.TrimSpace(key))
		if lower == "" || strings.Contains(lower, "password") || strings.Contains(lower, "token") || strings.Contains(lower, "secret") || strings.Contains(lower, "code") || strings.Contains(lower, "body") || strings.Contains(lower, "content") || strings.Contains(lower, "file") {
			continue
		}
		switch typed := value.(type) {
		case string:
			if len([]rune(typed)) <= 200 {
				result[key] = typed
			}
		case bool, int, int64, uint64, float64:
			result[key] = typed
		}
	}
	return result
}
