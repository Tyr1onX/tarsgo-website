package auth

import (
	"testing"
	"time"

	"tarsgo-backend/model"
)

func TestEnsureGitHubBindingAllowed(t *testing.T) {
	t.Parallel()

	if err := ensureGitHubBindingAllowed(&model.User{}, "60851806"); err != nil {
		t.Fatalf("expected nil error for unbound user, got %v", err)
	}

	currentID := "60851806"
	if err := ensureGitHubBindingAllowed(&model.User{GitHubID: &currentID}, "60851806"); err != nil {
		t.Fatalf("expected nil error for same github id, got %v", err)
	}
}

func TestEnsureGitHubBindingAllowedRejectsAnotherGitHubAccount(t *testing.T) {
	t.Parallel()

	currentID := "111"
	err := ensureGitHubBindingAllowed(&model.User{GitHubID: &currentID}, "222")
	if err == nil {
		t.Fatal("expected conflict error, got nil")
	}

	serviceErr, ok := err.(*ServiceError)
	if !ok {
		t.Fatalf("expected ServiceError, got %T", err)
	}
	if serviceErr.Status != 409 {
		t.Fatalf("expected status 409, got %d", serviceErr.Status)
	}
}

func TestBuildGitHubUserUpdatesForEmailBinding(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_775_983_000, 0)
	name := "苏风"
	user := &model.User{
		Email: "715041@qq.com",
	}
	profile := &GitHubProfile{
		Login:     "su-fen",
		AvatarURL: "https://avatars.githubusercontent.com/u/60851806?v=4",
		Name:      &name,
	}

	updates := buildGitHubUserUpdates(user, profile, "60851806", now, true)

	if updates["github_id"] != "60851806" {
		t.Fatalf("expected github_id to be linked, got %#v", updates["github_id"])
	}
	if updates["github_username"] != "su-fen" {
		t.Fatalf("expected github_username to be synced, got %#v", updates["github_username"])
	}
	if updates["avatar_url"] != "https://avatars.githubusercontent.com/u/60851806?v=4" {
		t.Fatalf("expected avatar_url to be synced, got %#v", updates["avatar_url"])
	}
	if updates["nickname"] != "苏风" {
		t.Fatalf("expected nickname to be populated, got %#v", updates["nickname"])
	}
	if updates["last_login_at"] != now {
		t.Fatalf("expected last_login_at to be set, got %#v", updates["last_login_at"])
	}
}

func TestBuildGitHubUserUpdatesKeepsExistingNickname(t *testing.T) {
	t.Parallel()

	now := time.Unix(1_775_983_000, 0)
	existingNickname := "本地昵称"
	githubName := "GitHub 昵称"
	user := &model.User{
		Nickname: &existingNickname,
	}
	profile := &GitHubProfile{
		Login: "su-fen",
		Name:  &githubName,
	}

	updates := buildGitHubUserUpdates(user, profile, "60851806", now, true)
	if _, exists := updates["nickname"]; exists {
		t.Fatalf("expected existing nickname to be preserved, got %#v", updates["nickname"])
	}
}

func TestNewGitHubUserBuildsExpectedUser(t *testing.T) {
	t.Parallel()

	name := "苏风"
	user := newGitHubUser(3, "715041@qq.com", &GitHubProfile{
		Login:     "su-fen",
		AvatarURL: "https://avatars.githubusercontent.com/u/60851806?v=4",
		Name:      &name,
	}, "60851806")

	if user.RoleID != 3 {
		t.Fatalf("expected role id 3, got %d", user.RoleID)
	}
	if user.Email != "715041@qq.com" {
		t.Fatalf("unexpected email: %s", user.Email)
	}
	if user.Name != "su-fen" {
		t.Fatalf("expected derived name su-fen, got %s", user.Name)
	}
	if user.GitHubID == nil || *user.GitHubID != "60851806" {
		t.Fatalf("unexpected github id: %#v", user.GitHubID)
	}
	if user.Nickname == nil || *user.Nickname != "苏风" {
		t.Fatalf("unexpected nickname: %#v", user.Nickname)
	}
}

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
