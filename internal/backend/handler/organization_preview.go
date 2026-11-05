package handler

import (
	"net/http"
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
	Status    uint8   `gorm:"column:status"`
}

// OrganizationPreview exposes only the confirmed roster, positions, and public
// account fields to authenticated workbench users.
func OrganizationPreview(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		preview := organization.PreviewData()
		userIDs := make([]uint64, 0, 16)
		assignedIDs := make(map[uint64]struct{})
		appendUserID := func(position *organization.Position) {
			if position.UserID != nil {
				userIDs = append(userIDs, *position.UserID)
				assignedIDs[*position.UserID] = struct{}{}
			}
		}
		appendUserID(&preview.Leader)
		for i := range preview.Categories {
			for j := range preview.Categories[i].Positions {
				appendUserID(&preview.Categories[i].Positions[j])
			}
		}

		rosterNames := make([]string, 0, len(preview.OtherMembers)+len(preview.OtherGuides))
		for _, member := range preview.OtherMembers {
			rosterNames = append(rosterNames, member.Name)
		}
		for _, guide := range preview.OtherGuides {
			rosterNames = append(rosterNames, guide.Name)
		}

		var accounts []organizationAccountProfile
		if err := db.WithContext(c.Request.Context()).
			Model(&model.User{}).
			Select("id", "real_name", "avatar_url", "status").
			Where("id IN ? OR real_name IN ?", userIDs, rosterNames).
			Find(&accounts).Error; err != nil {
			writeAPIError(c, http.StatusInternalServerError, "读取组织架构成员资料失败")
			return
		}
		profilesByID := make(map[uint64]organizationAccountProfile, len(accounts))
		profilesByName := make(map[string][]organizationAccountProfile, len(accounts))
		for _, account := range accounts {
			profilesByID[account.ID] = account
			if account.RealName != nil {
				name := strings.TrimSpace(*account.RealName)
				if name != "" {
					profilesByName[name] = append(profilesByName[name], account)
				}
			}
		}

		applyPositionProfile := func(position *organization.Position) {
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
		applyPositionProfile(&preview.Leader)
		for i := range preview.Categories {
			for j := range preview.Categories[i].Positions {
				applyPositionProfile(&preview.Categories[i].Positions[j])
			}
		}

		applyRosterProfile := func(member *organization.Member) {
			matches := profilesByName[member.Name]
			switch {
			case len(matches) == 0:
				member.AccountStatus = "账号不在"
			case len(matches) > 1:
				member.AccountStatus = "账号待核实"
			case matches[0].Status != model.UserStatusEnabled:
				member.AccountStatus = "账号不可用"
			default:
				if _, assigned := assignedIDs[matches[0].ID]; assigned {
					member.AccountStatus = "账号待核实"
					return
				}
				userID := matches[0].ID
				member.UserID = &userID
				member.AvatarURL = matches[0].AvatarURL
			}
		}
		for i := range preview.OtherMembers {
			applyRosterProfile(&preview.OtherMembers[i])
		}
		for i := range preview.OtherGuides {
			applyRosterProfile(&preview.OtherGuides[i])
		}

		writeAPI(c, http.StatusOK, "获取战队组织架构成功", preview)
	}
}
