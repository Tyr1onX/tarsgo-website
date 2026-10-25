package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

const MaxAccountSessions = 5

const (
	MaxSessionLifetime      = 30 * 24 * time.Hour
	SessionRenewWindow      = 24 * time.Hour
	ExpiredSessionRetention = 90 * 24 * time.Hour
)

const AccountVaultCookieName = "tarsgo_accounts"

type AccountSessionAccount struct {
	ID        uint64      `json:"id"`
	User      SessionUser `json:"user"`
	ExpiresAt time.Time   `json:"expiresAt"`
	Current   bool        `json:"current"`
	Status    string      `json:"status"`
}

type AccountSessionsResult struct {
	Accounts []AccountSessionAccount `json:"accounts"`
	User     *SessionUser            `json:"user,omitempty"`
	// Cookie values are returned only to the HTTP handler and are never JSON.
	SessionToken               string `json:"-"`
	VaultToken                 string `json:"-"`
	CurrentRemoved             bool   `json:"-"`
	VaultRemoved               bool   `json:"-"`
	SessionCookieMaxAgeSeconds int    `json:"-"`
	VaultCookieMaxAgeSeconds   int    `json:"-"`
}

type SessionRenewal struct {
	AuthCookieMaxAgeSeconds  int
	VaultCookieMaxAgeSeconds int
	AuthRenewed              bool
	VaultRenewed             bool
}

// CreateAccountSession runs after a credential login or registration succeeds.
// It keeps a live prior account in the same browser vault, then adds or refreshes
// the newly authenticated account. A sixth account is rejected without changing
// the current browser session.
func (s *Service) CreateAccountSession(ctx context.Context, userID uint64, currentToken, vaultToken string) (*AccountSessionsResult, error) {
	return s.createAccountSession(ctx, userID, currentToken, vaultToken, true)
}

func (s *Service) createAccountSession(ctx context.Context, userID uint64, currentToken, vaultToken string, credentialAuthentication bool) (*AccountSessionsResult, error) {
	if err := s.cleanupExpiredAuthDataIfDue(ctx); err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "清理过期登录记录失败", Err: err}
	}
	currentUser, currentExpiresAt := s.currentUserForVault(ctx, currentToken)
	currentSession, currentSessionFound, sessionReadErr := s.findAuthSession(ctx, currentToken)
	if sessionReadErr != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取登录会话失败", Err: sessionReadErr}
	}
	newToken, err := newOpaqueToken()
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "创建登录会话失败", Err: err}
	}
	newVaultToken := ""
	result := &AccountSessionsResult{SessionToken: newToken}
	now := s.now()
	newCreatedAt := now
	newExpiresAt := boundedSessionExpiry(now, newCreatedAt, s.authConfig.TokenTTL)
	if !credentialAuthentication && currentUser != nil && currentUser.ID == userID {
		if currentSessionFound {
			newCreatedAt = currentSession.CreatedAt
			newExpiresAt = boundedSessionExpiry(now, newCreatedAt, s.authConfig.TokenTTL)
		} else if !currentExpiresAt.IsZero() {
			// Upgrading a legacy signed cookie must not extend its original expiry.
			newCreatedAt = currentExpiresAt.Add(-MaxSessionLifetime)
			newExpiresAt = boundedSessionExpiry(now, newCreatedAt, s.authConfig.TokenTTL)
			if currentExpiresAt.Before(newExpiresAt) {
				newExpiresAt = currentExpiresAt
			}
		}
	}
	newVaultExpiresAt := boundedSessionExpiry(now, now, s.authConfig.TokenTTL)

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.revokeLegacyJWTTx(tx, currentToken, 0, now); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新旧登录态失败", Err: err}
		}
		user, err := s.loadUserWithRoleTx(tx, userID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &ServiceError{Status: http.StatusUnauthorized, Message: "当前用户不存在"}
			}
			return &ServiceError{Status: http.StatusInternalServerError, Message: "加载当前用户失败", Err: err}
		}
		if err := ensureValidAccount(user); err != nil {
			return err
		}

		vault, err := s.findAccountVaultTx(tx, vaultToken, now)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "读取已登录账号失败", Err: err}
		}
		if vault == nil {
			newVaultToken, err = newOpaqueToken()
			if err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "创建账号列表失败", Err: err}
			}
			vault = &model.AccountVault{SecretHash: digestSecret(newVaultToken), ExpiresAt: newVaultExpiresAt, CreatedAt: now}
			if err := tx.Create(vault).Error; err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "创建账号列表失败", Err: err}
			}
			result.VaultToken = newVaultToken
		}
		if _, err := s.listVaultEntriesTx(tx, vault.ID, 0, now); err != nil {
			return err
		}

		if currentUser != nil && currentUser.ID != userID {
			if err := s.ensureVaultEntryTx(tx, vault.ID, currentUser, currentExpiresAt, currentToken, ""); err != nil {
				return err
			}
		}

		entry, err := s.findVaultEntryTx(tx, vault.ID, userID)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "读取已登录账号失败", Err: err}
		}
		if entry == nil {
			count, err := s.countVaultEntriesTx(tx, vault.ID)
			if err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "读取已登录账号失败", Err: err}
			}
			if count >= MaxAccountSessions {
				return &ServiceError{Status: http.StatusConflict, Message: "同一浏览器最多保存 5 个账号，请先移除一个账号。"}
			}
			session := model.AuthSession{UserID: user.ID, TokenHash: digestSecret(newToken), ExpiresAt: newExpiresAt, CreatedAt: newCreatedAt}
			if err := tx.Create(&session).Error; err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "创建登录会话失败", Err: err}
			}
			entry = &model.AccountVaultEntry{VaultID: vault.ID, UserID: user.ID, SessionID: session.ID}
			if err := tx.Create(entry).Error; err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "保存已登录账号失败", Err: err}
			}
		} else {
			var session model.AuthSession
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&session, entry.SessionID).Error; err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "读取登录会话失败", Err: err}
			}
			if session.RevokedAt != nil || !now.Before(session.ExpiresAt) {
				session.UserID = user.ID
				session.TokenHash = digestSecret(newToken)
				session.ExpiresAt = newExpiresAt
				session.RevokedAt = nil
				session.CreatedAt = newCreatedAt
			} else {
				session.TokenHash = digestSecret(newToken)
				session.ExpiresAt = newExpiresAt
				session.CreatedAt = newCreatedAt
			}
			if err := tx.Save(&session).Error; err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "更新登录会话失败", Err: err}
			}
		}

		vault.ExpiresAt = newVaultExpiresAt
		vault.CreatedAt = now
		if err := tx.Save(vault).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新账号列表有效期失败", Err: err}
		}
		accounts, err := s.listVaultEntriesTx(tx, vault.ID, user.ID, now)
		if err != nil {
			return err
		}
		result.Accounts = accounts
		if result.VaultToken == "" {
			result.VaultToken = vaultToken
		}
		result.SessionCookieMaxAgeSeconds = s.cookieMaxAgeUntil(newExpiresAt)
		result.VaultCookieMaxAgeSeconds = s.cookieMaxAgeUntil(vault.ExpiresAt)
		// Any previous opaque cookie that was not itself rotated into the new
		// account slot must stop authenticating after this login completes.
		if err := s.revokeSessionTokenTx(tx, currentToken, now); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "撤销旧登录态失败", Err: err}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// InitializeAccountSessions upgrades a still-valid legacy JWT to a revocable
// opaque session and links the current identity to the browser's account vault.
func (s *Service) InitializeAccountSessions(ctx context.Context, currentToken, vaultToken string) (*AccountSessionsResult, error) {
	user, err := s.CurrentUser(ctx, currentToken)
	if err != nil {
		return nil, err
	}

	if session, found, err := s.findAuthSession(ctx, currentToken); err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取登录会话失败", Err: err}
	} else if found {
		var vault model.AccountVault
		if err := s.db.WithContext(ctx).Where("secret_hash = ? AND expires_at > ?", digestSecret(vaultToken), s.now()).First(&vault).Error; err == nil {
			var entry model.AccountVaultEntry
			if err := s.db.WithContext(ctx).Where("vault_id = ? AND user_id = ? AND session_id = ?", vault.ID, user.ID, session.ID).First(&entry).Error; err == nil && session.RevokedAt == nil && s.now().Before(session.ExpiresAt) {
				if _, err := s.RenewAccountSession(ctx, currentToken, vaultToken); err != nil {
					return nil, err
				}
				if refreshed, found, err := s.findAuthSession(ctx, currentToken); err != nil {
					return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取登录会话失败", Err: err}
				} else if found {
					session = refreshed
				}
				if err := s.db.WithContext(ctx).First(&vault, vault.ID).Error; err != nil {
					return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取账号列表失败", Err: err}
				}
				return &AccountSessionsResult{
					SessionToken: currentToken, VaultToken: vaultToken,
					Accounts:                   s.listVaultEntries(ctx, vault.ID, user.ID),
					SessionCookieMaxAgeSeconds: s.cookieMaxAgeUntil(session.ExpiresAt),
					VaultCookieMaxAgeSeconds:   s.cookieMaxAgeUntil(vault.ExpiresAt),
				}, nil
			}
		}
	}

	return s.createAccountSession(ctx, user.ID, currentToken, vaultToken, false)
}

func (s *Service) ListAccountSessions(ctx context.Context, vaultToken, currentToken string) (*AccountSessionsResult, error) {
	result := &AccountSessionsResult{Accounts: []AccountSessionAccount{}}
	if err := s.cleanupExpiredAuthDataIfDue(ctx); err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "清理过期登录记录失败", Err: err}
	}
	if strings.TrimSpace(vaultToken) == "" {
		return result, nil
	}
	var vault model.AccountVault
	if err := s.db.WithContext(ctx).Where("secret_hash = ? AND expires_at > ?", digestSecret(vaultToken), s.now()).First(&vault).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return result, nil
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取账号列表失败", Err: err}
	}
	currentUserID := uint64(0)
	if user, err := s.CurrentUser(ctx, currentToken); err == nil {
		currentUserID = user.ID
	}
	var err error
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result.Accounts, err = s.listVaultEntriesTx(tx, vault.ID, currentUserID, s.now())
		return err
	})
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取账号列表失败", Err: err}
	}
	return result, nil
}

func (s *Service) SwitchAccountSession(ctx context.Context, vaultToken string, entryID uint64) (*AccountSessionsResult, error) {
	if strings.TrimSpace(vaultToken) == "" || entryID == 0 {
		return nil, &ServiceError{Status: http.StatusUnauthorized, Message: "已保存账号不可用，请重新登录"}
	}
	token, err := newOpaqueToken()
	if err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "切换账号失败", Err: err}
	}
	result := &AccountSessionsResult{SessionToken: token}
	now := s.now()
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var vault model.AccountVault
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("secret_hash = ? AND expires_at > ?", digestSecret(vaultToken), now).First(&vault).Error; err != nil {
			return &ServiceError{Status: http.StatusUnauthorized, Message: "已保存账号不可用，请重新登录", Err: err}
		}
		var entry model.AccountVaultEntry
		if err := tx.Where("id = ? AND vault_id = ?", entryID, vault.ID).First(&entry).Error; err != nil {
			return &ServiceError{Status: http.StatusNotFound, Message: "已保存账号不存在或已过期", Err: err}
		}
		var session model.AuthSession
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&session, entry.SessionID).Error; err != nil {
			return &ServiceError{Status: http.StatusUnauthorized, Message: "已保存账号会话已失效，请重新登录", Err: err}
		}
		if session.UserID != entry.UserID || session.RevokedAt != nil || !now.Before(session.ExpiresAt) {
			return &ServiceError{Status: http.StatusUnauthorized, Message: "已保存账号会话已失效，请重新登录"}
		}
		user, err := s.loadUserWithRoleTx(tx, entry.UserID)
		if err != nil {
			return &ServiceError{Status: http.StatusUnauthorized, Message: "当前账号已不可用", Err: err}
		}
		if err := ensureValidAccount(user); err != nil {
			return err
		}
		newExpiresAt := boundedSessionExpiry(now, session.CreatedAt, s.authConfig.TokenTTL)
		if !newExpiresAt.After(now) {
			return &ServiceError{Status: http.StatusUnauthorized, Message: "登录已超过最长有效期，请重新验证"}
		}
		session.TokenHash = digestSecret(token)
		session.ExpiresAt = newExpiresAt
		if err := tx.Save(&session).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新登录会话失败", Err: err}
		}
		vault.ExpiresAt = boundedSessionExpiry(now, vault.CreatedAt, s.authConfig.TokenTTL)
		if err := tx.Save(&vault).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新账号列表有效期失败", Err: err}
		}
		userView := toSessionUser(user)
		result.User = &userView
		result.Accounts, err = s.listVaultEntriesTx(tx, vault.ID, user.ID, now)
		if err != nil {
			return err
		}
		for index := range result.Accounts {
			result.Accounts[index].Current = result.Accounts[index].User.ID == user.ID
		}
		result.VaultToken = vaultToken
		result.SessionCookieMaxAgeSeconds = s.cookieMaxAgeUntil(session.ExpiresAt)
		result.VaultCookieMaxAgeSeconds = s.cookieMaxAgeUntil(vault.ExpiresAt)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Service) RemoveAccountSession(ctx context.Context, vaultToken, currentToken string, entryID uint64) (*AccountSessionsResult, error) {
	if strings.TrimSpace(vaultToken) == "" || entryID == 0 {
		return nil, &ServiceError{Status: http.StatusUnauthorized, Message: "账号列表已失效"}
	}
	var currentUserID uint64
	if user, err := s.CurrentUser(ctx, currentToken); err == nil {
		currentUserID = user.ID
	}
	result := &AccountSessionsResult{}
	now := s.now()
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.revokeLegacyJWTTx(tx, currentToken, 0, now); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新旧登录态失败", Err: err}
		}
		var vault model.AccountVault
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("secret_hash = ? AND expires_at > ?", digestSecret(vaultToken), now).First(&vault).Error; err != nil {
			return &ServiceError{Status: http.StatusUnauthorized, Message: "账号列表已失效", Err: err}
		}
		var entry model.AccountVaultEntry
		if err := tx.Where("id = ? AND vault_id = ?", entryID, vault.ID).First(&entry).Error; err != nil {
			return &ServiceError{Status: http.StatusNotFound, Message: "该账号已从列表移除", Err: err}
		}
		result.CurrentRemoved = entry.UserID == currentUserID
		if result.CurrentRemoved {
			if err := s.revokeLegacyJWTTx(tx, currentToken, entry.UserID, now); err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "撤销当前登录态失败", Err: err}
			}
		}
		revokedAt := now
		if err := tx.Model(&model.AuthSession{}).Where("id = ?", entry.SessionID).Update("revoked_at", revokedAt).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "移除账号失败", Err: err}
		}
		if err := tx.Delete(&entry).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "移除账号失败", Err: err}
		}
		count, err := s.countVaultEntriesTx(tx, vault.ID)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "读取账号列表失败", Err: err}
		}
		if count == 0 {
			result.VaultRemoved = true
			if err := tx.Delete(&vault).Error; err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "清理账号列表失败", Err: err}
			}
		} else {
			result.Accounts, err = s.listVaultEntriesTx(tx, vault.ID, currentUserID, now)
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Service) LogoutCurrentAccount(ctx context.Context, currentToken, vaultToken string) (bool, error) {
	user, _ := s.CurrentUser(ctx, currentToken)
	keepVault := false
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := s.now()
		if err := s.revokeLegacyJWTTx(tx, currentToken, 0, now); err != nil {
			return err
		}
		if strings.TrimSpace(currentToken) != "" {
			if err := tx.Model(&model.AuthSession{}).Where("token_hash = ?", digestSecret(currentToken)).Update("revoked_at", now).Error; err != nil {
				return err
			}
		}
		vault, err := s.findAccountVaultTx(tx, vaultToken, now)
		if err != nil {
			return err
		}
		if vault == nil {
			return nil
		}
		if user != nil {
			var entry model.AccountVaultEntry
			if err := tx.Where("vault_id = ? AND user_id = ?", vault.ID, user.ID).First(&entry).Error; err == nil {
				revokedAt := now
				if err := tx.Model(&model.AuthSession{}).Where("id = ?", entry.SessionID).Update("revoked_at", revokedAt).Error; err != nil {
					return err
				}
				if err := tx.Delete(&entry).Error; err != nil {
					return err
				}
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}
		count, err := s.countVaultEntriesTx(tx, vault.ID)
		if err != nil {
			return err
		}
		if count == 0 {
			if err := tx.Delete(vault).Error; err != nil {
				return err
			}
			return nil
		}
		keepVault = true
		return nil
	})
	if err != nil {
		return false, &ServiceError{Status: http.StatusInternalServerError, Message: "退出账号失败", Err: err}
	}
	return keepVault, nil
}

func (s *Service) LogoutAllAccounts(ctx context.Context, currentToken, vaultToken string) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := s.now()
		if err := s.revokeLegacyJWTTx(tx, currentToken, 0, now); err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新旧登录态失败", Err: err}
		}
		if strings.TrimSpace(currentToken) != "" {
			if err := tx.Model(&model.AuthSession{}).Where("token_hash = ?", digestSecret(currentToken)).Update("revoked_at", now).Error; err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "退出全部账号失败", Err: err}
			}
		}
		vault, err := s.findAccountVaultTx(tx, vaultToken, now)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "退出全部账号失败", Err: err}
		}
		if vault == nil {
			return nil
		}
		var entries []model.AccountVaultEntry
		if err := tx.Where("vault_id = ?", vault.ID).Find(&entries).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "退出全部账号失败", Err: err}
		}
		for _, entry := range entries {
			if err := tx.Model(&model.AuthSession{}).Where("id = ?", entry.SessionID).Update("revoked_at", now).Error; err != nil {
				return &ServiceError{Status: http.StatusInternalServerError, Message: "退出全部账号失败", Err: err}
			}
		}
		if err := tx.Where("vault_id = ?", vault.ID).Delete(&model.AccountVaultEntry{}).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "退出全部账号失败", Err: err}
		}
		if err := tx.Delete(vault).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "退出全部账号失败", Err: err}
		}
		return nil
	})
}

func (s *Service) currentUserForVault(ctx context.Context, token string) (*SessionUser, time.Time) {
	if strings.TrimSpace(token) == "" {
		return nil, time.Time{}
	}
	user, err := s.CurrentUser(ctx, token)
	if err != nil {
		return nil, time.Time{}
	}
	if session, found, err := s.findAuthSession(ctx, token); err == nil && found {
		return user, session.ExpiresAt
	}
	claims, err := ParseToken(s.authConfig.JWTSecret, token)
	if err == nil {
		return user, time.Unix(claims.ExpiresAt, 0)
	}
	return user, s.now().Add(s.authConfig.TokenTTL)
}

func (s *Service) findAuthSession(ctx context.Context, token string) (*model.AuthSession, bool, error) {
	if strings.TrimSpace(token) == "" {
		return nil, false, nil
	}
	var session model.AuthSession
	err := s.db.WithContext(ctx).Where("token_hash = ?", digestSecret(token)).First(&session).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return &session, true, nil
}

func (s *Service) findAccountVaultTx(tx *gorm.DB, token string, now time.Time) (*model.AccountVault, error) {
	if strings.TrimSpace(token) == "" {
		return nil, nil
	}
	var vault model.AccountVault
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("secret_hash = ?", digestSecret(token)).First(&vault).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !now.Before(vault.ExpiresAt) {
		return nil, nil
	}
	return &vault, nil
}

func (s *Service) ensureVaultEntryTx(tx *gorm.DB, vaultID uint64, user *SessionUser, expiresAt time.Time, oldToken, newActiveToken string) error {
	if user == nil || user.ID == 0 {
		return nil
	}
	if !expiresAt.After(s.now()) {
		expiresAt = s.now().Add(s.authConfig.TokenTTL)
	}
	entry, err := s.findVaultEntryTx(tx, vaultID, user.ID)
	if err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "读取已登录账号失败", Err: err}
	}
	if entry == nil {
		count, err := s.countVaultEntriesTx(tx, vaultID)
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "读取已登录账号失败", Err: err}
		}
		if count >= MaxAccountSessions {
			return &ServiceError{Status: http.StatusConflict, Message: "同一浏览器最多保存 5 个账号，请先移除一个账号。"}
		}
		hiddenToken, err := newOpaqueToken()
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "创建登录会话失败", Err: err}
		}
		if newActiveToken != "" {
			hiddenToken = newActiveToken
		}
		session := model.AuthSession{UserID: user.ID, TokenHash: digestSecret(hiddenToken), ExpiresAt: expiresAt}
		if err := tx.Create(&session).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "创建登录会话失败", Err: err}
		}
		entry = &model.AccountVaultEntry{VaultID: vaultID, UserID: user.ID, SessionID: session.ID}
		if err := tx.Create(entry).Error; err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "保存已登录账号失败", Err: err}
		}
		return nil
	}
	var session model.AuthSession
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&session, entry.SessionID).Error; err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "读取登录会话失败", Err: err}
	}
	if newActiveToken != "" {
		session.TokenHash = digestSecret(newActiveToken)
	} else if oldToken != "" {
		hiddenToken, err := newOpaqueToken()
		if err != nil {
			return &ServiceError{Status: http.StatusInternalServerError, Message: "更新登录会话失败", Err: err}
		}
		session.TokenHash = digestSecret(hiddenToken)
	}
	session.UserID = user.ID
	session.ExpiresAt = expiresAt
	session.RevokedAt = nil
	if err := tx.Save(&session).Error; err != nil {
		return &ServiceError{Status: http.StatusInternalServerError, Message: "更新登录会话失败", Err: err}
	}
	return nil
}

// Legacy JWTs are still accepted during the upgrade window. Keep a revoked JWT
// digest in auth_sessions through its original expiry so CurrentUser never falls
// back to signature validation after a logout, account removal, or session swap.
func (s *Service) revokeLegacyJWTTx(tx *gorm.DB, token string, userID uint64, now time.Time) error {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil
	}
	if _, found, err := s.findAuthSessionTx(tx, token); err != nil {
		return err
	} else if found {
		return nil
	}
	claims, err := ParseToken(s.authConfig.JWTSecret, token)
	if err != nil {
		return nil
	}
	if userID == 0 {
		userID, err = strconv.ParseUint(claims.Subject, 10, 64)
		if err != nil {
			return nil
		}
	}
	revokedAt := now
	return tx.Create(&model.AuthSession{
		UserID:    userID,
		TokenHash: digestSecret(token),
		ExpiresAt: time.Unix(claims.ExpiresAt, 0),
		RevokedAt: &revokedAt,
	}).Error
}

func (s *Service) revokeSessionTokenTx(tx *gorm.DB, token string, now time.Time) error {
	if strings.TrimSpace(token) == "" {
		return nil
	}
	return tx.Model(&model.AuthSession{}).
		Where("token_hash = ? AND revoked_at IS NULL", digestSecret(token)).
		Update("revoked_at", now).Error
}

func (s *Service) findAuthSessionTx(tx *gorm.DB, token string) (*model.AuthSession, bool, error) {
	if strings.TrimSpace(token) == "" {
		return nil, false, nil
	}
	var session model.AuthSession
	err := tx.Where("token_hash = ?", digestSecret(token)).First(&session).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return &session, true, nil
}

func (s *Service) findVaultEntryTx(tx *gorm.DB, vaultID, userID uint64) (*model.AccountVaultEntry, error) {
	var entry model.AccountVaultEntry
	err := tx.Where("vault_id = ? AND user_id = ?", vaultID, userID).First(&entry).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

func (s *Service) countVaultEntriesTx(tx *gorm.DB, vaultID uint64) (int64, error) {
	var count int64
	err := tx.Model(&model.AccountVaultEntry{}).Where("vault_id = ?", vaultID).Count(&count).Error
	return count, err
}

func (s *Service) listVaultEntries(ctx context.Context, vaultID, currentUserID uint64) []AccountSessionAccount {
	var accounts []AccountSessionAccount
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		accounts, err = s.listVaultEntriesTx(tx, vaultID, currentUserID, s.now())
		return err
	})
	if err != nil {
		return []AccountSessionAccount{}
	}
	return accounts
}

func (s *Service) listVaultEntriesTx(tx *gorm.DB, vaultID, currentUserID uint64, now time.Time) ([]AccountSessionAccount, error) {
	var entries []model.AccountVaultEntry
	if err := tx.Where("vault_id = ?", vaultID).Order("created_at ASC, id ASC").Find(&entries).Error; err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "读取账号列表失败", Err: err}
	}
	accounts := make([]AccountSessionAccount, 0, len(entries))
	for _, entry := range entries {
		var session model.AuthSession
		sessionExists := true
		if err := tx.First(&session, entry.SessionID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				sessionExists = false
			} else {
				return nil, err
			}
		}
		user, err := s.loadUserWithRoleTx(tx, entry.UserID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				if err := tx.Delete(&entry).Error; err != nil {
					return nil, err
				}
				continue
			}
			return nil, err
		}
		status := accountSessionStatus(sessionExists, session, user, entry.UserID, now)
		userView := toSessionUser(user)
		accounts = append(accounts, AccountSessionAccount{
			ID:        entry.ID,
			User:      userView,
			ExpiresAt: session.ExpiresAt,
			Current:   user.ID == currentUserID,
			Status:    status,
		})
	}
	return accounts, nil
}

func accountSessionStatus(sessionExists bool, session model.AuthSession, user *model.User, entryUserID uint64, now time.Time) string {
	if ensureValidAccount(user) != nil {
		return "disabled"
	}
	if sessionExists && (session.UserID != entryUserID || session.RevokedAt != nil) {
		return "revoked"
	}
	if !sessionExists || !session.ExpiresAt.After(now) {
		return "expired"
	}
	return "available"
}

// RenewAccountSession slides the idle expiration only when a valid opaque
// session is close to expiry. Session and account-vault cookies stay bounded
// by a fixed 30-day absolute lifetime from the last credential login.
func (s *Service) RenewAccountSession(ctx context.Context, sessionToken, vaultToken string) (*SessionRenewal, error) {
	now := s.now()
	if err := s.cleanupExpiredAuthDataIfDue(ctx); err != nil {
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "清理过期登录记录失败", Err: err}
	}
	renewal := &SessionRenewal{}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var session model.AuthSession
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("token_hash = ?", digestSecret(sessionToken)).First(&session).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil // Legacy JWTs are not sliding-renewed.
		}
		if err != nil {
			return err
		}
		if session.RevokedAt != nil || !now.Before(session.ExpiresAt) || !session.CreatedAt.Add(MaxSessionLifetime).After(now) {
			return &ServiceError{Status: http.StatusUnauthorized, Message: "登录态已失效，请重新验证"}
		}
		if session.ExpiresAt.Sub(now) <= SessionRenewWindow {
			session.ExpiresAt = boundedSessionExpiry(now, session.CreatedAt, s.authConfig.TokenTTL)
			if err := tx.Save(&session).Error; err != nil {
				return err
			}
			renewal.AuthRenewed = true
		}
		renewal.AuthCookieMaxAgeSeconds = s.cookieMaxAgeUntil(session.ExpiresAt)

		if strings.TrimSpace(vaultToken) == "" {
			return nil
		}
		var vault model.AccountVault
		err = tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("secret_hash = ?", digestSecret(vaultToken)).First(&vault).Error
		if errors.Is(err, gorm.ErrRecordNotFound) || (err == nil && !now.Before(vault.ExpiresAt)) {
			return nil
		}
		if err != nil {
			return err
		}
		vaultDeadline := vault.CreatedAt.Add(MaxSessionLifetime)
		if vaultDeadline.After(now) && vault.ExpiresAt.Sub(now) <= SessionRenewWindow {
			vault.ExpiresAt = boundedSessionExpiry(now, vault.CreatedAt, s.authConfig.TokenTTL)
			if err := tx.Save(&vault).Error; err != nil {
				return err
			}
			renewal.VaultRenewed = true
		}
		renewal.VaultCookieMaxAgeSeconds = s.cookieMaxAgeUntil(vault.ExpiresAt)
		return nil
	})
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) {
			return nil, serviceErr
		}
		return nil, &ServiceError{Status: http.StatusInternalServerError, Message: "续期登录会话失败", Err: err}
	}
	return renewal, nil
}

func boundedSessionExpiry(now, createdAt time.Time, ttl time.Duration) time.Time {
	if ttl <= 0 {
		ttl = 72 * time.Hour
	}
	return minTime(now.Add(ttl), createdAt.Add(MaxSessionLifetime))
}

func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

func (s *Service) cookieMaxAgeUntil(expiresAt time.Time) int {
	seconds := int(math.Ceil(expiresAt.Sub(s.now()).Seconds()))
	if seconds < 1 {
		return 1
	}
	if configured := s.authConfig.CookieMaxAgeSeconds; configured > 0 && seconds > configured {
		return configured
	}
	return seconds
}

func (s *Service) cleanupExpiredAuthDataIfDue(ctx context.Context) error {
	// Cleanup is opportunistic and throttled per app process. Expired sessions
	// linked to a live vault remain visible so users can reauthenticate them.
	s.cleanupMu.Lock()
	if !s.lastAuthCleanup.IsZero() && s.now().Sub(s.lastAuthCleanup) < time.Hour {
		s.cleanupMu.Unlock()
		return nil
	}
	s.lastAuthCleanup = s.now()
	s.cleanupMu.Unlock()

	now := s.now()
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("vault_id IN (?)", tx.Model(&model.AccountVault{}).Select("id").Where("expires_at <= ?", now)).Delete(&model.AccountVaultEntry{}).Error; err != nil {
			return err
		}
		if err := tx.Where("expires_at <= ?", now).Delete(&model.AccountVault{}).Error; err != nil {
			return err
		}
		cutoff := now.Add(-ExpiredSessionRetention)
		return tx.Where("expires_at <= ? AND NOT EXISTS (SELECT 1 FROM account_vault_entries WHERE account_vault_entries.session_id = auth_sessions.id)", cutoff).Delete(&model.AuthSession{}).Error
	})
	return err
}

func ensureValidAccount(user *model.User) error {
	if err := ensureUserEnabled(user); err != nil {
		return err
	}
	return validateIdentityConsistency(user)
}

func digestSecret(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func newOpaqueToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}
