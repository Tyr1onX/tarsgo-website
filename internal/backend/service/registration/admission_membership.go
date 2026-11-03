package registration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"tarsgo-backend/model"
)

// Effects record provenance in the existing audit log, never access eligibility.
// Corrections undo only their own changes and preserve independent promotions.
type admissionEffect struct {
	UserID           uint64 `json:"targetUserId"`
	GroupID          uint64 `json:"groupId"`
	CreatedMemberID  uint64 `json:"createdMemberId,omitempty"`
	PreviousIdentity string `json:"previousIdentity"`
	IdentityChanged  bool   `json:"identityChanged"`
}

func (r *gormRegistrationRepository) SyncAdmissionMembership(ctx context.Context, reg *model.Registration, result string, actorID uint64, now time.Time) error {
	if result == reg.RecruitmentStatus {
		return nil
	}
	if result != model.RecruitmentStatusAdmitted && reg.RecruitmentStatus != model.RecruitmentStatusAdmitted {
		return nil
	}
	tx := r.db.WithContext(ctx)
	var user model.User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Role").First(&user, reg.UserID).Error; err != nil {
		return err
	}
	path := fmt.Sprintf("/api/admin/registrations/%d/admission-membership", reg.ID)
	effect := admissionEffect{UserID: user.ID, PreviousIdentity: model.NormalizeTeamIdentityStatus(user.TeamIdentityStatus)}
	action := "recruitment.admission.granted"
	if result == model.RecruitmentStatusAdmitted {
		if reg.PreferredGroupID == nil {
			return &ServiceError{Status: http.StatusConflict, Message: "候选人缺少有效录取组别"}
		}
		effect.GroupID = *reg.PreferredGroupID
		var group model.UserGroup
		if err := tx.Where("id = ? AND status = ?", effect.GroupID, model.UserGroupStatusActive).First(&group).Error; err != nil {
			return &ServiceError{Status: http.StatusConflict, Message: "录取组别不存在或已停用", Err: err}
		}
		// Add the admitted group; never replace other memberships or group roles.
		var member model.UserGroupMember
		err := tx.Where("user_id = ? AND group_id = ?", user.ID, effect.GroupID).First(&member).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			member = model.UserGroupMember{UserID: user.ID, GroupID: effect.GroupID, Role: model.UserGroupMemberRoleMember, JoinedAt: now}
			if err := tx.Create(&member).Error; err != nil {
				return err
			}
			effect.CreatedMemberID = member.ID
		} else if err != nil {
			return err
		}
		if user.TeamIdentityStatus != model.TeamIdentityFormalMember && user.TeamIdentityStatus != model.TeamIdentityTraineeMember {
			effect.IdentityChanged = true
			if err := tx.Model(&user).UpdateColumn("team_identity_status", model.TeamIdentityTraineeMember).Error; err != nil {
				return err
			}
		}
	} else {
		action = "recruitment.admission.reverted"
		var audit model.AuditLog
		err := tx.Where("path = ? AND action IN ?", path, []string{"recruitment.admission.granted", "recruitment.admission.reverted"}).Order("id DESC").First(&audit).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		} // Never infer historical ownership.
		if err != nil {
			return err
		}
		if audit.Action != "recruitment.admission.granted" {
			return nil
		}
		if err := json.Unmarshal([]byte(audit.Metadata), &effect); err != nil {
			return err
		}
		if effect.UserID != user.ID {
			return fmt.Errorf("admission audit user mismatch")
		}
		// System roles and existing memberships were never changed. Revert
		// only admission-created effects even when the user is an admin.
		protected := user.TeamIdentityStatus == model.TeamIdentityFormalMember
		var member model.UserGroupMember
		if effect.CreatedMemberID != 0 {
			err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ? AND group_id = ?", effect.CreatedMemberID, user.ID, effect.GroupID).First(&member).Error
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			protected = protected || member.Role != model.UserGroupMemberRoleMember
			if !protected && member.ID != 0 {
				if err := tx.Delete(&member).Error; err != nil {
					return err
				}
			}
		}
		if !protected && effect.IdentityChanged && user.TeamIdentityStatus == model.TeamIdentityTraineeMember {
			if err := tx.Model(&user).UpdateColumn("team_identity_status", effect.PreviousIdentity).Error; err != nil {
				return err
			}
		}
	}
	metadata, err := json.Marshal(effect)
	if err != nil {
		return err
	}
	return tx.Create(&model.AuditLog{ActorID: &actorID, Action: action, Method: http.MethodPut, Path: path, Status: http.StatusOK, Metadata: string(metadata), CreatedAt: now}).Error
}
