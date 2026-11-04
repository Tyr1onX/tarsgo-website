package auth

import (
	"context"
	"fmt"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"os"
	"tarsgo-backend/config"
	"tarsgo-backend/model"
	"tarsgo-backend/service/accountprofile"
	"tarsgo-backend/service/leave"
	"testing"
	"time"
)

func TestMariaDBUnifiedRegistrationAndCanonicalProfile(t *testing.T) {
	dsn := os.Getenv("TARSGO_INTEGRATION_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set isolated integration DSN")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	conn, _ := db.DB()
	defer conn.Close()
	tx := db.Begin()
	defer tx.Rollback()
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)
	s := NewService(&config.Config{Auth: config.AuthConfig{TokenTTL: time.Hour}}, tx)
	s.now = func() time.Time { return now }
	for i, student := range []bool{true, false} {
		email := fmt.Sprintf("canonical-%d-%d@tarsgo.test", now.UnixNano(), i)
		code := model.EmailCode{Email: email, Purpose: model.EmailCodePurposeRegister, CodeHash: HashVerificationCode(email, model.EmailCodePurposeRegister, "123456"), ExpiresAt: now.Add(time.Hour), LastSentAt: now}
		if err := tx.Create(&code).Error; err != nil {
			t.Fatal(err)
		}
		in := RegisterEmailInput{Input: accountprofile.Input{IsStudent: &student, StudentID: "20241421", College: "通信工程学院"}, Email: email, Password: "Synthetic123!", RealName: "注册测试", Code: "123456"}
		result, err := s.RegisterWithEmail(ctx, in)
		if err != nil {
			t.Fatal(err)
		}
		var u model.User
		if err := tx.First(&u, result.User.ID).Error; err != nil {
			t.Fatal(err)
		}
		if u.Phone != nil || u.IsStudent == nil || *u.IsStudent != student || u.TeamIdentityStatus != model.TeamIdentityCommunityMember {
			t.Fatalf("unexpected account: %+v", u)
		}
		if student && (u.StudentID != "20241421" || u.Grade != "2024 级") {
			t.Fatal("student details not persisted")
		}
		if !student && (u.StudentID != "" || u.College != "" || u.Grade != "") {
			t.Fatal("nonstudent academic fields collected")
		}
		if err := ComparePassword(*u.PasswordHash, "Synthetic123!"); err != nil {
			t.Fatal(err)
		}
		var groups int64
		tx.Model(&model.UserGroupMember{}).Where("user_id = ?", u.ID).Count(&groups)
		if groups != 0 {
			t.Fatal("registration created membership")
		}
		if !student {
			continue
		}
		if err := tx.Model(&u).Updates(map[string]any{"phone": "historic-phone", "gender": 2, "campus": "历史校区"}).Error; err != nil {
			t.Fatal(err)
		}
		document, err := leave.NewService(tx).GetProfile(ctx, u.ID)
		if err != nil || document == nil || document.StudentID != u.StudentID {
			t.Fatalf("new account can't use leave identity: %+v %v", document, err)
		}
		locked := model.LeaveProfile{UserID: u.ID, Name: "锁定姓名", StudentID: fmt.Sprintf("%08d", u.ID), CollegeCode: "communications-engineering", ParticipantType: "formal", IdentityLocked: true}
		if err := tx.Create(&locked).Error; err != nil {
			t.Fatal(err)
		}
		no := false
		if _, err := s.UpdateProfile(ctx, u.ID, ProfileInput{RealName: "修改测试", Academic: &accountprofile.Input{IsStudent: &no}}); err != nil {
			t.Fatal(err)
		}
		var saved model.User
		tx.First(&saved, u.ID)
		if saved.Phone == nil || *saved.Phone != "historic-phone" || saved.Gender != 2 || saved.Campus != "历史校区" || saved.StudentID != u.StudentID || saved.College != u.College {
			t.Fatal("profile edit overwrote legacy data")
		}
		old, err := leave.NewService(tx).GetProfile(ctx, u.ID)
		if err != nil || old.Name != locked.Name || old.StudentID != locked.StudentID || !old.IdentityLocked || old.ParticipantType != "formal" {
			t.Fatal("legal locked identity changed")
		}
		p, err := s.AccountProfile(ctx, u.ID)
		if err != nil || !p.Complete() || p.StudentID != "" || p.College != "" {
			t.Fatalf("nonstudent canonical profile: %+v %v", p, err)
		}
	}
}
