package operationssync

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

type Douyin struct {
	db           *gorm.DB
	client       *http.Client
	baseURL      string
	clientKey    string
	clientSecret string
	redirectURI  string
	secret       [32]byte
	now          func() time.Time
}

type douyinTokens struct {
	Access  string `json:"access"`
	Refresh string `json:"refresh"`
}

type douyinTokenReply struct {
	Data struct {
		AccessToken      string      `json:"access_token"`
		RefreshToken     string      `json:"refresh_token"`
		OpenID           string      `json:"open_id"`
		Scope            string      `json:"scope"`
		ExpiresIn        json.Number `json:"expires_in"`
		RefreshExpiresIn json.Number `json:"refresh_expires_in"`
		ErrorCode        json.Number `json:"error_code"`
	} `json:"data"`
}

func NewDouyin(db *gorm.DB, clientKey, clientSecret, encryptionSecret string) *Douyin {
	if clientKey == "" || clientSecret == "" || encryptionSecret == "" {
		return nil
	}
	return &Douyin{
		db: db, client: &http.Client{Timeout: 15 * time.Second}, baseURL: "https://open.douyin.com",
		clientKey: clientKey, clientSecret: clientSecret,
		redirectURI: "https://jijiamaster.com/api/operations/douyin/callback",
		secret: sha256.Sum256([]byte(encryptionSecret)), now: time.Now,
	}
}

func (d *Douyin) AuthorizeURL(userID uint64) string {
	state := fmt.Sprintf("%d:%d", userID, d.now().Unix())
	mac := hmac.New(sha256.New, d.secret[:])
	mac.Write([]byte(state))
	state += ":" + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	q := url.Values{
		"client_key": {d.clientKey}, "response_type": {"code"},
		"scope": {"user_info,video.list,data.external.user"},
		"redirect_uri": {d.redirectURI}, "state": {state},
	}
	return d.baseURL + "/platform/oauth/connect?" + q.Encode()
}

func (d *Douyin) verifyState(userID uint64, state string) bool {
	parts := strings.Split(state, ":")
	if len(parts) != 3 || parts[0] != strconv.FormatUint(userID, 10) {
		return false
	}
	issued, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || issued > d.now().Unix() || d.now().Unix()-issued > 600 {
		return false
	}
	got, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, d.secret[:])
	mac.Write([]byte(parts[0] + ":" + parts[1]))
	return hmac.Equal(got, mac.Sum(nil))
}

func (d *Douyin) encodeTokens(tokens douyinTokens) (string, error) {
	data, err := json.Marshal(tokens)
	if err != nil { return "", err }
	block, err := aes.NewCipher(d.secret[:])
	if err != nil { return "", err }
	gcm, err := cipher.NewGCM(block)
	if err != nil { return "", err }
	nonce := make([]byte, gcm.NonceSize())
	if _, err = rand.Read(nonce); err != nil { return "", err }
	return base64.RawStdEncoding.EncodeToString(gcm.Seal(nonce, nonce, data, nil)), nil
}

func (d *Douyin) decodeTokens(value string) (douyinTokens, error) {
	var tokens douyinTokens
	data, err := base64.RawStdEncoding.DecodeString(value)
	if err != nil { return tokens, err }
	block, err := aes.NewCipher(d.secret[:])
	if err != nil { return tokens, err }
	gcm, err := cipher.NewGCM(block)
	if err != nil { return tokens, err }
	if len(data) < gcm.NonceSize() { return tokens, errors.New("invalid token record") }
	clear, err := gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], nil)
	if err != nil { return tokens, err }
	err = json.Unmarshal(clear, &tokens)
	return tokens, err
}

func (d *Douyin) request(ctx context.Context, method, path, token string, body io.Reader, contentType string, result any) error {
	req, err := http.NewRequestWithContext(ctx, method, d.baseURL+path, body)
	if err != nil { return err }
	if token != "" { req.Header.Set("access-token", token) }
	if contentType != "" { req.Header.Set("Content-Type", contentType) }
	resp, err := d.client.Do(req)
	if err != nil { return err }
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK { return fmt.Errorf("Douyin HTTP %d", resp.StatusCode) }
	if err := json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(result); err != nil {
		return fmt.Errorf("invalid Douyin API response: %w", err)
	}
	return nil
}

func (d *Douyin) tokenRequest(ctx context.Context, path string, params url.Values) (douyinTokenReply, error) {
	var reply douyinTokenReply
	err := d.request(ctx, http.MethodPost, path, "", strings.NewReader(params.Encode()), "application/x-www-form-urlencoded", &reply)
	if err != nil { return reply, err }
	if reply.Data.ErrorCode.String() != "0" || reply.Data.AccessToken == "" {
		return reply, fmt.Errorf("Douyin token error %s", reply.Data.ErrorCode)
	}
	return reply, nil
}

func (d *Douyin) Connected(ctx context.Context) bool {
	if d == nil { return false }
	var grant model.OperationsDouyinAuthorization
	return d.db.WithContext(ctx).First(&grant, 1).Error == nil && d.now().Before(grant.RefreshExpiresAt)
}

func (d *Douyin) Connect(ctx context.Context, userID uint64, state, code string) error {
	if !d.verifyState(userID, state) || code == "" || len(code) > 1024 {
		return errors.New("抖音授权状态无效，请重新发起连接")
	}
	reply, err := d.tokenRequest(ctx, "/oauth/access_token/", url.Values{
		"client_key": {d.clientKey}, "client_secret": {d.clientSecret},
		"code": {code}, "grant_type": {"authorization_code"},
	})
	if err != nil { return err }
	token := reply.Data
	accessSeconds, accessErr := token.ExpiresIn.Int64()
	refreshSeconds, refreshErr := token.RefreshExpiresIn.Int64()
	if token.OpenID == "" || token.RefreshToken == "" || accessErr != nil || refreshErr != nil || accessSeconds <= 0 || refreshSeconds <= 0 {
		return errors.New("抖音授权响应不完整")
	}
	scopes := "," + token.Scope + ","
	if !strings.Contains(scopes, ",user_info,") || !strings.Contains(scopes, ",video.list,") || !strings.Contains(scopes, ",data.external.user,") {
		return errors.New("抖音未授予粉丝与作品数据权限")
	}

	// Verify the nickname so a personal account cannot silently replace the team's data.
	var userInfo struct { Data struct {
		Nickname string `json:"nickname"`
		ErrorCode json.Number `json:"error_code"`
	} `json:"data"` }
	if err = d.request(ctx, http.MethodPost, "/oauth/userinfo/", "",
		strings.NewReader(url.Values{"access_token": {token.AccessToken}, "open_id": {token.OpenID}}.Encode()),
		"application/x-www-form-urlencoded", &userInfo); err != nil { return err }
	if userInfo.Data.ErrorCode.String() != "0" || strings.TrimSpace(userInfo.Data.Nickname) != "吉甲大师TARS Go" {
		return errors.New("请使用吉甲大师TARS Go战队抖音账号授权")
	}
	var old model.OperationsDouyinAuthorization
	if err := d.db.WithContext(ctx).First(&old, 1).Error; err == nil && old.OpenID != token.OpenID {
		return errors.New("已连接其他抖音账号，不能覆盖战队账号")
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) { return err }
	encrypted, err := d.encodeTokens(douyinTokens{Access: token.AccessToken, Refresh: token.RefreshToken})
	if err != nil { return err }
	grant := model.OperationsDouyinAuthorization{
		ID: 1, OpenID: token.OpenID, EncryptedTokens: encrypted,
		AccessExpiresAt: d.now().Add(time.Duration(accessSeconds)*time.Second),
		RefreshExpiresAt: d.now().Add(time.Duration(refreshSeconds)*time.Second),
	}
	return d.db.WithContext(ctx).Clauses(clause.OnConflict{UpdateAll: true}).Create(&grant).Error
}

func (d *Douyin) accessToken(ctx context.Context) (string, error) {
	var grant model.OperationsDouyinAuthorization
	if err := d.db.WithContext(ctx).First(&grant, 1).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) { return "", errors.New("not connected") }
		return "", err
	}
	tokens, err := d.decodeTokens(grant.EncryptedTokens)
	if err != nil { return "", err }
	if !d.now().Before(grant.RefreshExpiresAt) { return "", errors.New("Douyin authorization expired; reconnect") }

	// Refresh tokens last 30 days and can only be renewed five times.
	if grant.RenewalCount < 5 && d.now().Add(72*time.Hour).After(grant.RefreshExpiresAt) {
		var reply struct { Data struct {
			RefreshToken string `json:"refresh_token"`
			ExpiresIn json.Number `json:"expires_in"`
			ErrorCode json.Number `json:"error_code"`
		} `json:"data"` }
		err := d.request(ctx, http.MethodPost, "/oauth/renew_refresh_token/", "",
			strings.NewReader(url.Values{"client_key": {d.clientKey}, "refresh_token": {tokens.Refresh}}.Encode()),
			"application/x-www-form-urlencoded", &reply)
		if err != nil { return "", err }
		renewSeconds, renewErr := reply.Data.ExpiresIn.Int64()
		if reply.Data.ErrorCode.String() != "0" || reply.Data.RefreshToken == "" || renewErr != nil || renewSeconds <= 0 {
			return "", fmt.Errorf("Douyin refresh renewal error %s; reconnect may be required", reply.Data.ErrorCode)
		}
		tokens.Refresh = reply.Data.RefreshToken
		grant.RefreshExpiresAt = d.now().Add(time.Duration(renewSeconds)*time.Second)
		grant.RenewalCount++
		// Persist immediately; the previous refresh token is invalid after rotation.
		grant.EncryptedTokens, err = d.encodeTokens(tokens)
		if err != nil { return "", err }
		if err = d.db.WithContext(ctx).Save(&grant).Error; err != nil { return "", err }
	}
	if d.now().Add(24*time.Hour).After(grant.AccessExpiresAt) {
		reply, err := d.tokenRequest(ctx, "/oauth/refresh_token/", url.Values{
			"client_key": {d.clientKey}, "grant_type": {"refresh_token"}, "refresh_token": {tokens.Refresh},
		})
		if err != nil { return "", err }
		accessSeconds, accessErr := reply.Data.ExpiresIn.Int64()
		if reply.Data.OpenID != grant.OpenID || accessErr != nil || accessSeconds <= 0 {
			return "", errors.New("Douyin token belongs to another account")
		}
		tokens.Access = reply.Data.AccessToken
		if reply.Data.RefreshToken != "" { tokens.Refresh = reply.Data.RefreshToken }
		grant.AccessExpiresAt = d.now().Add(time.Duration(accessSeconds)*time.Second)
		grant.EncryptedTokens, err = d.encodeTokens(tokens)
		if err != nil { return "", err }
		if err = d.db.WithContext(ctx).Save(&grant).Error; err != nil { return "", err }
	}
	return tokens.Access, nil
}

func (d *Douyin) fetchFollowers(ctx context.Context, token string) ([]model.OperationsAccountSnapshot, error) {
	var reply struct { Data struct {
		ErrorCode json.Number `json:"error_code"`
		ResultList []struct {
			Date string `json:"date"`
			TotalFans json.Number `json:"total_fans"`
		} `json:"result_list"`
	} `json:"data"` }
	if err := d.request(ctx, http.MethodGet, "/data/external/user/fans/", token, nil, "application/json", &reply); err != nil { return nil, err }
	if reply.Data.ErrorCode.String() != "0" { return nil, fmt.Errorf("Douyin fans error %s", reply.Data.ErrorCode) }
	snapshots := make([]model.OperationsAccountSnapshot, 0)
	today := d.now().In(beijing).Format("2006-01-02")
	for _, entry := range reply.Data.ResultList {
		if _, err := time.Parse("2006-01-02", entry.Date); err != nil || entry.Date > today { continue }
		fans, err := entry.TotalFans.Int64()
		if err != nil || fans < 0 { continue }
		snapshots = append(snapshots, model.OperationsAccountSnapshot{
			Platform: "douyin", ObservedOn: entry.Date, Followers: fans, Source: "douyin_api",
		})
	}
	return snapshots, nil
}

func (d *Douyin) fetchVideos(ctx context.Context, token, openID string) ([]model.OperationsPlatformPost, error) {
	posts := make([]model.OperationsPlatformPost, 0)
	var cursor int64
	for page := 0; page < 4; page++ {
		q := url.Values{"open_id": {openID}, "cursor": {strconv.FormatInt(cursor, 10)}, "count": {"20"}}
		var reply struct { Data struct {
			ErrorCode json.Number `json:"error_code"`
			HasMore bool `json:"has_more"`
			Cursor int64 `json:"cursor"`
			List []struct {
				Title string `json:"title"`
				CreateTime int64 `json:"create_time"`
				IsReviewed bool `json:"is_reviewed"`
				VideoStatus int `json:"video_status"`
				ShareURL string `json:"share_url"`
				Statistics struct { PlayCount int64 `json:"play_count"` } `json:"statistics"`
			} `json:"list"`
		} `json:"data"` }
		if err := d.request(ctx, http.MethodGet, "/video/list/?"+q.Encode(), token, nil, "application/json", &reply); err != nil { return nil, err }
		if reply.Data.ErrorCode.String() != "0" { return nil, fmt.Errorf("Douyin videos error %s", reply.Data.ErrorCode) }
		for _, entry := range reply.Data.List {
			if !entry.IsReviewed || entry.VideoStatus != 5 || entry.CreateTime <= 0 ||
				entry.CreateTime > d.now().Unix()+60 || entry.Statistics.PlayCount < 0 { continue }
			title := strings.TrimSpace(strings.Split(entry.Title, "\n")[0])
			if title == "" { continue }
			if runes := []rune(title); len(runes) > 120 { title = string(runes[:120]) }
			u, err := url.Parse(entry.ShareURL)
			if err != nil || u.Scheme != "https" || (u.Hostname() != "www.iesdouyin.com" &&
				u.Hostname() != "www.douyin.com" && u.Hostname() != "v.douyin.com") { continue }
			// The XLSX import already uses publication seconds as its stable ID.
			posts = append(posts, model.OperationsPlatformPost{
				Platform: "douyin", ExternalID: strconv.FormatInt(entry.CreateTime, 10),
				Title: title, URL: entry.ShareURL, PublishedAt: time.Unix(entry.CreateTime, 0).UTC(),
				ViewCount: entry.Statistics.PlayCount, SyncedAt: d.now().UTC(),
			})
		}
		if !reply.Data.HasMore { return posts, nil }
		if reply.Data.Cursor == cursor { return nil, errors.New("Douyin pagination stalled") }
		cursor = reply.Data.Cursor
	}
	return posts, nil
}

func (d *Douyin) Sync(ctx context.Context) error {
	if d == nil || !d.Connected(ctx) { return nil }
	token, err := d.accessToken(ctx)
	if err != nil { return err }
	var grant model.OperationsDouyinAuthorization
	if err := d.db.WithContext(ctx).First(&grant, 1).Error; err != nil { return err }
	var failures []error
	followers, err := d.fetchFollowers(ctx, token)
	if err != nil { failures = append(failures, fmt.Errorf("fans: %w", err)) } else if len(followers) > 0 {
		err = d.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).CreateInBatches(followers, 30).Error
		if err != nil { failures = append(failures, fmt.Errorf("save fans: %w", err)) }
	}
	posts, err := d.fetchVideos(ctx, token, grant.OpenID)
	if err != nil { failures = append(failures, fmt.Errorf("videos: %w", err)) } else if len(posts) > 0 {
		err = d.db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "platform"}, {Name: "external_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"title", "url", "view_count", "synced_at"}),
		}).CreateInBatches(posts, 30).Error
		if err != nil { failures = append(failures, fmt.Errorf("save videos: %w", err)) }
	}
	return errors.Join(failures...)
}
