package registration

import (
	"strings"

	"tarsgo-backend/model"
)

type RegistrationGroupRef struct {
	ID   uint64 `json:"id"`
	Name string `json:"name"`
}

type RegistrationReviewerRef struct {
	ID    uint64 `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type ScreeningDecisionInput struct {
	Decision string
	Remark   string
}

type registrationAccessScope struct {
	fullAccess bool
}

func newRegistrationAccessScope(fullAccess bool, _ []uint64) registrationAccessScope {
	return registrationAccessScope{fullAccess: fullAccess}
}

func (scope registrationAccessScope) canAccessRegistration(registration *model.Registration) bool {
	return registration != nil && scope.fullAccess
}

func canMutateRegistrationBeforeReview(registration *model.Registration) bool {
	return registration != nil && registration.RecruitmentStatus == model.RecruitmentStatusPendingScreening
}

func toRegistrationGroupRef(group *model.UserGroup) *RegistrationGroupRef {
	if group == nil || group.ID == 0 {
		return nil
	}
	return &RegistrationGroupRef{ID: group.ID, Name: group.Name}
}

func toRegistrationReviewerRef(user *model.User) *RegistrationReviewerRef {
	if user == nil || user.ID == 0 {
		return nil
	}
	name := "姓名待核实"
	if user.RealName != nil && strings.TrimSpace(*user.RealName) != "" {
		name = strings.TrimSpace(*user.RealName)
	}
	return &RegistrationReviewerRef{ID: user.ID, Name: name, Email: user.Email}
}
