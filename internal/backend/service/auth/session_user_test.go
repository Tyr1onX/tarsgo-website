package auth

import (
	"encoding/json"
	"strings"
	"testing"

	"tarsgo-backend/model"
)

func TestToSessionUserIncludesAvatarURL(t *testing.T) {
	t.Parallel()

	avatarURL := "https://avatars.githubusercontent.com/u/60851806?v=4"
	user := &model.User{
		ID:        7,
		Email:     "user@example.com",
		AvatarURL: &avatarURL,
		Role: model.Role{
			ID:          3,
			Name:        model.RoleNameUser,
			DisplayName: "普通用户",
		},
	}

	sessionUser := toSessionUser(user)
	if sessionUser.AvatarURL == nil || *sessionUser.AvatarURL != avatarURL {
		t.Fatalf("expected avatar url to be included, got %#v", sessionUser.AvatarURL)
	}
}

func TestToSessionUserExposesOnlyTheSystemRole(t *testing.T) {
	t.Parallel()

	user := &model.User{
		ID:    7,
		Email: "admin@example.com",
		Role:  model.Role{ID: 2, Name: model.RoleNameAdmin, DisplayName: "管理员"},
	}
	sessionUser := toSessionUser(user)
	if sessionUser.Role.Name != model.RoleNameAdmin {
		t.Fatalf("expected admin role in session, got %#v", sessionUser.Role)
	}
	payload, err := json.Marshal(sessionUser)
	if err != nil {
		t.Fatalf("marshal session user: %v", err)
	}
	for _, retiredField := range []string{"adminScope", "managementGroupId", "groupRole", "permissions", "capabilities"} {
		if strings.Contains(string(payload), retiredField) {
			t.Fatalf("session user exposed retired field %q: %s", retiredField, payload)
		}
	}
}
