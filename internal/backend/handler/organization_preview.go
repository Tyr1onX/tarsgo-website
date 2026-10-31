package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"tarsgo-backend/model"
	"tarsgo-backend/service/organization"
)

type organizationAccountProfile struct {
	ID        uint64  `gorm:"column:id"`
	RealName  *string `gorm:"column:real_name"`
	Nickname  *string `gorm:"column:nickname"`
	AvatarURL *string `gorm:"column:avatar_url"`
}

// OrganizationPreview remains behind the existing super-admin route. Its
// account lookup deliberately selects only the name and avatar used by cards.
func OrganizationPreview(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		preview := organization.PreviewData()
		userIDs := make([]uint64, 0, 15)
		appendUserID := func(position *organization.Position) {
			if position.UserID != nil {
				userIDs = append(userIDs, *position.UserID)
			}
		}
		appendUserID(&preview.Leader)
		for categoryIndex := range preview.Categories {
			for positionIndex := range preview.Categories[categoryIndex].Positions {
				appendUserID(&preview.Categories[categoryIndex].Positions[positionIndex])
			}
		}

		if len(userIDs) > 0 {
			var accounts []organizationAccountProfile
			if err := db.WithContext(c.Request.Context()).
				Model(&model.User{}).
				Select("id", "real_name", "nickname", "avatar_url").
				Where("id IN ?", userIDs).
				Find(&accounts).Error; err != nil {
				writeAPIError(c, http.StatusInternalServerError, "读取组织架构成员资料失败")
				return
			}
			profilesByID := make(map[uint64]organizationAccountProfile, len(accounts))
			for _, account := range accounts {
				profilesByID[account.ID] = account
			}
			applyProfile := func(position *organization.Position) {
				if position.UserID == nil {
					return
				}
				account, exists := profilesByID[*position.UserID]
				if !exists {
					return
				}
				if name := (model.User{RealName: account.RealName, Nickname: account.Nickname}).PreferredName(); name != "" {
					position.Name = name
				}
				position.AvatarURL = account.AvatarURL
			}
			applyProfile(&preview.Leader)
			for categoryIndex := range preview.Categories {
				for positionIndex := range preview.Categories[categoryIndex].Positions {
					applyProfile(&preview.Categories[categoryIndex].Positions[positionIndex])
				}
			}
		}

		writeAPI(c, http.StatusOK, "获取战队组织架构成功", preview)
	}
}
