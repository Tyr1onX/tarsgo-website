package email

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log"
	"mime"
	"net/http"
	"strings"
	"time"

	"tarsgo-backend/config"
)

// Message contains business content only. Sender identity and credentials belong
// to the sending implementation and never come from browser requests.
type Message struct {
	To              string
	Subject         string
	Text            string
	HTML            string
	InlineImage     []byte
	InlineImageType string
}

type Mailer interface {
	SendEmail(context.Context, Message) error
}

type Sender struct {
	cfg    config.EmailConfig
	client *http.Client
}

func NewSender(cfg config.EmailConfig) *Sender {
	return &Sender{cfg: cfg, client: &http.Client{
		Timeout:       15 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

// SendEmail is the application's sole email sending entry point.
func (s *Sender) SendEmail(ctx context.Context, message Message) error {
	if strings.TrimSpace(s.cfg.APIKey) == "" || strings.TrimSpace(s.cfg.From) == "" {
		return deliveryError("邮件服务尚未配置，请联系管理员")
	}
	markup := message.HTML
	if markup == "" {
		markup = `<div style="white-space:pre-wrap;font-family:sans-serif">` + html.EscapeString(message.Text) + `</div>`
	}
	payload := map[string]any{
		"from": s.cfg.From, "to": []string{message.To},
		"subject": message.Subject, "text": message.Text, "html": markup,
	}
	if len(message.InlineImage) > 0 {
		mediaType, _, err := mime.ParseMediaType(message.InlineImageType)
		if err != nil || !strings.HasPrefix(mediaType, "image/") {
			return deliveryError("邮件图片格式不合法")
		}
		extensions, _ := mime.ExtensionsByType(mediaType)
		extension := ".png"
		if len(extensions) > 0 {
			extension = extensions[0]
		}
		payload["html"] = markup + `<p><img src="cid:admission-image" alt="录取群二维码" style="max-width:100%;height:auto"></p>`
		payload["attachments"] = []map[string]string{{
			"filename":   "admission-image" + extension,
			"content":    base64.StdEncoding.EncodeToString(message.InlineImage),
			"content_id": "admission-image",
		}}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return deliveryError("邮件内容编码失败")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(encoded))
	if err != nil {
		return deliveryError("邮件请求创建失败")
	}
	req.Header.Set("Authorization", "Bearer "+s.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")
	response, err := s.client.Do(req)
	if err != nil {
		// Network errors and provider response bodies can contain sensitive data.
		return deliveryError("邮件服务连接失败或超时，请稍后重试")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var failure struct {
			Name string `json:"name"`
		}
		_ = json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&failure)
		message := "邮件服务发送失败，请检查服务商控制台"
		switch {
		case failure.Name == "daily_quota_exceeded" || failure.Name == "monthly_quota_exceeded" || failure.Name == "rate_limit_exceeded" || response.StatusCode == http.StatusTooManyRequests:
			message = "邮件服务额度或速率受限，请检查服务商控制台"
		case response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden:
			message = "邮件服务认证或域名验证失败，请检查服务商配置"
		case response.StatusCode == http.StatusBadRequest || response.StatusCode == http.StatusUnprocessableEntity:
			message = "邮件服务拒绝了发送请求，请检查收件地址和域名配置"
		}
		return deliveryError(fmt.Sprintf("%s（HTTP %d）", message, response.StatusCode))
	}
	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&result); err != nil || result.ID == "" {
		return deliveryError("邮件服务返回无效结果，请检查服务商控制台后再重试")
	}
	return nil
}

func deliveryError(message string) error {
	// Only fixed descriptions/status are logged: no keys, recipients or content.
	log.Printf("email delivery failed: %s", message)
	return fmt.Errorf("%s", message)
}
