package handler

import (
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"tarsgo-backend/model"
	"tarsgo-backend/service/organization"
)

type organizationAccountProfile struct {
	ID        uint64  `gorm:"column:id"`
	RealName  *string `gorm:"column:real_name"`
	AvatarURL *string `gorm:"column:avatar_url"`
	TeamIdentityStatus string `gorm:"column:team_identity_status"`
	Status uint8 `gorm:"column:status"`
}

// OrganizationPreview exposes only team position data and the public name and
// avatar needed by the organization chart. Routes decide which signed-in
// audiences may read this view.
func OrganizationPreview(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		preview := organization.PreviewData()
		userIDs := make([]uint64, 0, 15)
		assignedIDs := make(map[uint64]struct{})
		appendUserID := func(position *organization.Position) {
			if position.UserID != nil {
				userIDs = append(userIDs, *position.UserID)
				assignedIDs[*position.UserID] = struct{}{}
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
				Select("id", "real_name", "avatar_url", "team_identity_status", "status").
				Where("id IN ? OR (team_identity_status = ? AND status = ?)", userIDs, model.TeamIdentityFormalMember, model.UserStatusEnabled).
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
				if account.RealName != nil && strings.TrimSpace(*account.RealName) != "" {
					position.Name = strings.TrimSpace(*account.RealName)
				} else {
					position.Name = "姓名待核实"
				}
				position.AvatarURL = account.AvatarURL
			}
			applyProfile(&preview.Leader)
			for categoryIndex := range preview.Categories {
				for positionIndex := range preview.Categories[categoryIndex].Positions {
					applyProfile(&preview.Categories[categoryIndex].Positions[positionIndex])
				}
			}
			for _, account := range accounts {
				if account.TeamIdentityStatus != model.TeamIdentityFormalMember || account.Status != model.UserStatusEnabled {
					continue
				}
				if _, assigned := assignedIDs[account.ID]; assigned {
					continue
				}
				name := "姓名待核实"
				if account.RealName != nil && strings.TrimSpace(*account.RealName) != "" {
					name = strings.TrimSpace(*account.RealName)
				}
				userID := account.ID
				preview.OtherMembers = append(preview.OtherMembers, organization.Member{
					Name: name, UserID: &userID, AvatarURL: account.AvatarURL,
				})
			}
			sort.Slice(preview.OtherMembers, func(i, j int) bool {
				if preview.OtherMembers[i].Name != preview.OtherMembers[j].Name {
					return preview.OtherMembers[i].Name < preview.OtherMembers[j].Name
				}
				return *preview.OtherMembers[i].UserID < *preview.OtherMembers[j].UserID
			})
		}

		writeAPI(c, http.StatusOK, "获取战队组织架构成功", preview)
	}
}
