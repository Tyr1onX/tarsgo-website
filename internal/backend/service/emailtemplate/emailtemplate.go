package emailtemplate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"tarsgo-backend/model"
)

const ConfigKey = "email_notification_templates"

type Template struct {
	Subject string `json:"subject"`
	Body    string `json:"body"`
}

type Templates struct {
	ScreeningRejected Template `json:"screeningRejected"`
	InterviewAdmitted Template `json:"interviewAdmitted"`
	InterviewRejected Template `json:"interviewRejected"`
}

type Variable struct {
	Name    string `json:"name"`
	Token   string `json:"token"`
	Label   string `json:"label"`
	Example string `json:"example"`
}

type ConfigStore interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key, value string) error
}

type GormStore struct{ db *gorm.DB }

func NewGormStore(db *gorm.DB) *GormStore { return &GormStore{db: db} }

func (s *GormStore) Get(ctx context.Context, key string) (string, error) {
	var config model.SystemConfig
	err := s.db.WithContext(ctx).Where("config_key = ?", key).First(&config).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return config.ConfigValue, nil
}

func (s *GormStore) Set(ctx context.Context, key, value string) error {
	config := model.SystemConfig{ConfigKey: key, ConfigValue: value}
	return s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "config_key"}},
		DoUpdates: clause.AssignmentColumns([]string{"config_value", "updated_at"}),
	}).Create(&config).Error
}

func Default() Templates {
	return Templates{
		ScreeningRejected: Template{
			Subject: "吉甲大师纳新初筛结果通知（未通过）",
			Body:    "尊敬的 {{name}}：\n\n你好！\n\n感谢你报名参加吉甲大师纳新。经报名资料初筛，很遗憾你未能通过本次初筛，无须前往现场参加面试。\n\n报名项目：{{project}}\n意向组：{{group}}\n当前状态：初筛未通过\n\n感谢你的关注与参与，祝你在今后的学习与实践中不断进步。\n\n吉甲大师\n{{date}}",
		},
		InterviewAdmitted: Template{
			Subject: "吉甲大师纳新录取通知",
			Body:    "尊敬的 {{name}}：\n\n你好！\n\n感谢你报名参加吉甲大师纳新。经线下面试，恭喜你被“{{group}}”录取！\n\n报名项目：{{project}}\n录取组：{{group}}\n当前状态：已录取\n\n请扫描邮件内的录取群二维码加入对应小组，后续安排及相关事项将在群内通知。\n\n感谢你的参与与配合。\n\n吉甲大师\n{{date}}",
		},
		InterviewRejected: Template{
			Subject: "吉甲大师纳新面试结果通知（未通过）",
			Body:    "尊敬的 {{name}}：\n\n你好！\n\n感谢你报名参加吉甲大师纳新，并参与“{{group}}”的线下面试。\n\n经综合评估，很遗憾你未能通过本次面试，本次招新流程到此结束。\n\n报名项目：{{project}}\n意向组：{{group}}\n当前状态：未通过\n\n感谢你在报名及面试过程中所投入的时间与精力，祝你在今后的学习与实践中不断进步。\n\n吉甲大师\n{{date}}",
		},
	}
}

func Variables() []Variable {
	return []Variable{
		{Name: "name", Token: "{{name}}", Label: "姓名", Example: "张三"},
		{Name: "project", Token: "{{project}}", Label: "报名项目", Example: "2026 招新报名"},
		{Name: "group", Token: "{{group}}", Label: "组别", Example: "机械组"},
		{Name: "date", Token: "{{date}}", Label: "日期", Example: "2026年10月13日"},
	}
}

func Load(ctx context.Context, store ConfigStore) (Templates, error) {
	defaults := Default()
	if store == nil {
		return defaults, nil
	}
	value, err := store.Get(ctx, ConfigKey)
	if err != nil {
		return Templates{}, err
	}
	if strings.TrimSpace(value) == "" {
		return defaults, nil
	}
	var templates Templates
	if err := json.Unmarshal([]byte(value), &templates); err != nil {
		return Templates{}, fmt.Errorf("邮件模板配置无法读取")
	}
	if err := Validate(templates); err != nil {
		return Templates{}, fmt.Errorf("邮件模板配置不合法：%w", err)
	}
	return templates, nil
}

func Save(ctx context.Context, store ConfigStore, templates Templates) error {
	if err := Validate(templates); err != nil {
		return err
	}
	if store == nil {
		return fmt.Errorf("邮件模板存储不可用")
	}
	value, err := json.Marshal(templates)
	if err != nil {
		return fmt.Errorf("邮件模板编码失败")
	}
	return store.Set(ctx, ConfigKey, string(value))
}

func Validate(templates Templates) error {
	items := []struct {
		label    string
		template Template
	}{
		{"初筛未通过", templates.ScreeningRejected},
		{"面试录取", templates.InterviewAdmitted},
		{"面试未通过", templates.InterviewRejected},
	}
	for _, item := range items {
		if strings.TrimSpace(item.template.Subject) == "" || utf8.RuneCountInString(item.template.Subject) > 255 || strings.ContainsAny(item.template.Subject, "\r\n") {
			return fmt.Errorf("%s邮件主题不能为空、不能换行且不能超过 255 个字", item.label)
		}
		if strings.TrimSpace(item.template.Body) == "" || utf8.RuneCountInString(item.template.Body) > 10000 {
			return fmt.Errorf("%s邮件正文不能为空且不能超过 10000 个字", item.label)
		}
		if err := validatePlaceholders(item.template.Subject); err != nil {
			return fmt.Errorf("%s邮件主题：%w", item.label, err)
		}
		if err := validatePlaceholders(item.template.Body); err != nil {
			return fmt.Errorf("%s邮件正文：%w", item.label, err)
		}
	}
	return nil
}

func Render(template Template, values map[string]string) Template {
	for _, variable := range Variables() {
		replacement := strings.NewReplacer("\r", " ", "\n", " ").Replace(values[variable.Name])
		template.Subject = strings.ReplaceAll(template.Subject, variable.Token, replacement)
		template.Body = strings.ReplaceAll(template.Body, variable.Token, values[variable.Name])
	}
	return template
}

func validatePlaceholders(value string) error {
	allowed := map[string]bool{"name": true, "project": true, "group": true, "date": true}
	for cursor := 0; cursor < len(value); {
		open := strings.Index(value[cursor:], "{{")
		close := strings.Index(value[cursor:], "}}")
		if close >= 0 && (open < 0 || close < open) {
			return fmt.Errorf("包含未支持的变量；请使用姓名、报名项目、组别或日期变量")
		}
		if open < 0 {
			return nil
		}
		start := cursor + open
		end := strings.Index(value[start+2:], "}}")
		if end < 0 {
			return fmt.Errorf("包含未支持的变量；请使用姓名、报名项目、组别或日期变量")
		}
		name := value[start+2 : start+2+end]
		if !allowed[name] {
			return fmt.Errorf("包含未支持的变量；请使用姓名、报名项目、组别或日期变量")
		}
		cursor = start + 2 + end + 2
	}
	return nil
}
