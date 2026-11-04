// Package accountprofile provides the single account profile view. Legacy leave
// documents are read only fallback data, never another self-service profile.
package accountprofile

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"gorm.io/gorm"
	"tarsgo-backend/model"
	"tarsgo-backend/service/leave"
)

type Input struct {
	IsStudent *bool  `json:"isStudent"`
	StudentID string `json:"studentId"`
	College   string `json:"college"`
	Grade     string `json:"grade"`
}

type Profile struct {
	Input
	RealName string `json:"realName"`
	Email    string `json:"email"`
}

var knownJLU = regexp.MustCompile(`^(20|35)[0-9]{6}$`)
var studentNumber = regexp.MustCompile(`^[A-Z0-9]{1,40}$`)
var gradeYear = regexp.MustCompile(`^(19[0-9]{2}|20[0-9]{2})\s*级?$`)

// Only the confirmed 20 and 35 college/year/class/sequence families are
// recognized. Other college prefixes, graduate IDs and arbitrary numbers fall
// back to explicit grade selection. This is formatting, not student verification.
func InferGrade(id string, now time.Time) string {
	id = strings.TrimSpace(id)
	if !knownJLU.MatchString(id) || (id[4:6] == "00" || id[6:] == "00") {
		return ""
	}
	year, _ := strconv.Atoi("20" + id[2:4])
	if year < 2000 || year > now.Year() {
		return ""
	}
	return fmt.Sprintf("%d 级", year)
}

func Resolve(db *gorm.DB, u model.User, now time.Time) (Profile, error) {
	p := Profile{Input: Input{IsStudent: u.IsStudent, StudentID: u.StudentID, College: u.College, Grade: u.Grade}, Email: u.Email}
	if u.RealName != nil {
		p.RealName = strings.TrimSpace(*u.RealName)
	}
	// Explicit nonstudents retain legacy storage, but need no academic data.
	if p.IsStudent != nil && !*p.IsStudent {
		p.StudentID = ""
		p.College = ""
		p.Grade = ""
		return p, nil
	}
	if p.RealName == "" || p.StudentID == "" || p.College == "" {
		var old model.LeaveProfile
		err := db.Where("user_id = ?", u.ID).Take(&old).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return p, err
		}
		if err == nil {
			if p.RealName == "" {
				p.RealName = old.Name
			}
			if p.StudentID == "" {
				p.StudentID = old.StudentID
			}
			if p.College == "" {
				p.College = old.CollegeCode
				for _, c := range leave.NewService(db).Colleges() {
					if c.Code == old.CollegeCode {
						p.College = c.Name
						break
					}
				}
			}
		}
	}
	if p.IsStudent == nil && p.StudentID != "" {
		yes := true
		p.IsStudent = &yes
	}
	if p.Grade == "" {
		p.Grade = InferGrade(p.StudentID, now)
	}
	return p, nil
}

func Normalize(in Input, now time.Time) (Input, error) {
	if in.IsStudent == nil {
		return in, fmt.Errorf("请选择是否在校学生")
	}
	in.StudentID = strings.ToUpper(strings.TrimSpace(in.StudentID))
	in.College = strings.TrimSpace(in.College)
	in.Grade = strings.TrimSpace(in.Grade)
	if !*in.IsStudent {
		return Input{IsStudent: in.IsStudent}, nil
	}
	if !studentNumber.MatchString(in.StudentID) {
		return in, fmt.Errorf("请填写有效学号（仅限字母和数字，最多 40 位）")
	}
	if !validText(in.College, 100) {
		return in, fmt.Errorf("请填写学院")
	}
	if grade := InferGrade(in.StudentID, now); grade != "" {
		in.Grade = grade
	} else {
		m := gradeYear.FindStringSubmatch(in.Grade)
		if m == nil {
			return in, fmt.Errorf("无法识别学号对应年级，请手动选择入学年份")
		}
		year, _ := strconv.Atoi(m[1])
		if year < 1950 || year > now.Year() {
			return in, fmt.Errorf("请选择有效入学年份")
		}
		in.Grade = m[1] + " 级"
	}
	return in, nil
}

// Historical nonempty grade labels remain usable without rewriting them.
func (p Profile) Complete() bool {
	return validText(p.RealName, 100) && p.Email != "" && p.IsStudent != nil && (!*p.IsStudent || (studentNumber.MatchString(strings.ToUpper(strings.TrimSpace(p.StudentID))) && validText(p.College, 100) && validText(p.Grade, 40)))
}
func validText(s string, limit int) bool {
	s = strings.TrimSpace(s)
	return s != "" && utf8.RuneCountInString(s) <= limit && strings.IndexFunc(s, unicode.IsControl) < 0
}
