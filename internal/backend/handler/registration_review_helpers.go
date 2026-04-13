package handler

import (
	"net/http"
	"strings"

	"tarsgo-backend/model"
)

const (
	registrationReviewDecisionApprove = "approve"
	registrationReviewDecisionReject  = "reject"
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

type ReviewRegistrationInput struct {
	Decision string
	Remark   string
}

type registrationAccessScope struct {
	fullAccess     bool
	leaderGroupIDs map[uint64]struct{}
}

func newRegistrationAccessScope(fullAccess bool, leaderGroupIDs []uint64) registrationAccessScope {
	scope := registrationAccessScope{
		fullAccess:     fullAccess,
		leaderGroupIDs: make(map[uint64]struct{}, len(leaderGroupIDs)),
	}
	for _, groupID := range leaderGroupIDs {
		if groupID == 0 {
			continue
		}
		scope.leaderGroupIDs[groupID] = struct{}{}
	}
	return scope
}

func (scope registrationAccessScope) hasGroup(groupID uint64) bool {
	if scope.fullAccess {
		return true
	}
	_, ok := scope.leaderGroupIDs[groupID]
	return ok
}

func (scope registrationAccessScope) canAccessRegistration(registration *model.Registration) bool {
	if registration == nil {
		return false
	}
	if scope.fullAccess {
		return true
	}
	if registration.Group1ID != nil && scope.hasGroup(*registration.Group1ID) {
		return true
	}
	if registration.Group2ID != nil && scope.hasGroup(*registration.Group2ID) {
		return true
	}
	return false
}

func (scope registrationAccessScope) reviewableSlots(registration *model.Registration) (bool, bool) {
	if registration == nil || registration.Status == model.RegistrationStatusCancelled {
		return false, false
	}
	if scope.fullAccess {
		return registration.Group1Status == model.RegistrationStatusPending, registration.Group2Status == model.RegistrationStatusPending
	}

	slot1 := registration.Group1ID != nil &&
		scope.hasGroup(*registration.Group1ID) &&
		registration.Group1Status == model.RegistrationStatusPending
	slot2 := registration.Group2ID != nil &&
		scope.hasGroup(*registration.Group2ID) &&
		registration.Group2Status == model.RegistrationStatusPending
	return slot1, slot2
}

func (scope registrationAccessScope) reviewActionAvailability(registration *model.Registration) (bool, bool) {
	slot1, slot2 := scope.reviewableSlots(registration)
	canReview := slot1 || slot2
	return canReview, canReview
}

func normalizeRegistrationReviewDecision(decision string) (uint8, error) {
	switch strings.ToLower(strings.TrimSpace(decision)) {
	case registrationReviewDecisionApprove:
		return model.RegistrationStatusApproved, nil
	case registrationReviewDecisionReject:
		return model.RegistrationStatusRejected, nil
	default:
		return 0, &registrationServiceError{Status: http.StatusBadRequest, Message: "审核结果不合法"}
	}
}

func deriveRegistrationStatus(group1Status uint8, group2Status uint8) uint8 {
	if group1Status == model.RegistrationStatusPending || group2Status == model.RegistrationStatusPending {
		return model.RegistrationStatusPending
	}
	if group1Status == model.RegistrationStatusApproved || group2Status == model.RegistrationStatusApproved {
		return model.RegistrationStatusApproved
	}
	return model.RegistrationStatusRejected
}

func isRegistrationReviewCompleted(group1Status uint8, group2Status uint8) bool {
	return group1Status != model.RegistrationStatusPending && group2Status != model.RegistrationStatusPending
}

func approvedRegistrationGroupIDs(registration *model.Registration, group1Status uint8, group2Status uint8) []uint64 {
	if registration == nil {
		return nil
	}

	groupIDs := make([]uint64, 0, 2)
	seen := make(map[uint64]struct{}, 2)
	appendIfApproved := func(groupID *uint64, status uint8) {
		if groupID == nil || *groupID == 0 || status != model.RegistrationStatusApproved {
			return
		}
		if _, exists := seen[*groupID]; exists {
			return
		}
		seen[*groupID] = struct{}{}
		groupIDs = append(groupIDs, *groupID)
	}

	appendIfApproved(registration.Group1ID, group1Status)
	appendIfApproved(registration.Group2ID, group2Status)
	return groupIDs
}

func toRegistrationGroupRef(group *model.UserGroup) *RegistrationGroupRef {
	if group == nil || group.ID == 0 {
		return nil
	}
	return &RegistrationGroupRef{
		ID:   group.ID,
		Name: group.Name,
	}
}

func toRegistrationReviewerRef(user *model.User) *RegistrationReviewerRef {
	if user == nil || user.ID == 0 {
		return nil
	}
	return &RegistrationReviewerRef{
		ID:    user.ID,
		Name:  user.Name,
		Email: user.Email,
	}
}
