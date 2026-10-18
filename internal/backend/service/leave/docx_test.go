package leave

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"tarsgo-backend/model"
)

func setLeaveTemplateTestAssets(t *testing.T) {
	t.Helper()
	assetDir := t.TempDir()
	for name, content := range map[string][]byte{
		"instructor-signature.png": []byte("test instructor signature"),
		"team-seal.png":            []byte("test team seal"),
	} {
		if err := os.WriteFile(filepath.Join(assetDir, name), content, 0o600); err != nil {
			t.Fatalf("write test leave asset %s: %v", name, err)
		}
	}
	t.Setenv("LEAVE_TEMPLATE_ASSET_DIR", assetDir)
}

func documentXML(t *testing.T, content []byte) string {
	t.Helper()
	data, ok := documentPart(t, content, "word/document.xml")
	if !ok {
		t.Fatal("DOCX is missing word/document.xml")
	}
	var parsed struct{ XMLName xml.Name }
	if err := xml.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("generated Word document XML is invalid: %v", err)
	}
	return string(data)
}

func documentPart(t *testing.T, content []byte, part string) ([]byte, bool) {
	t.Helper()
	archive, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("open generated DOCX: %v", err)
	}
	for _, file := range archive.File {
		if file.Name != part {
			continue
		}
		reader, err := file.Open()
		if err != nil {
			t.Fatalf("open document XML: %v", err)
		}
		data, err := io.ReadAll(reader)
		_ = reader.Close()
		if err != nil {
			t.Fatalf("read document XML: %v", err)
		}
		return data, true
	}
	return nil, false
}

func TestDailyLeaveDocumentIncludesIdentityAndClassPeriod(t *testing.T) {
	setLeaveTemplateTestAssets(t)
	start := time.Date(2026, 10, 19, 8, 0, 0, 0, shanghai)
	end := time.Date(2026, 10, 19, 9, 50, 0, 0, shanghai)
	profile := model.LeaveProfile{Name: "虚构成员", StudentID: "00000001"}
	content, err := buildDailyLeaveDocx(start, end, profile, "计算机科学与技术学院", "000-0000", false)
	if err != nil {
		t.Fatal(err)
	}
	xmlText := documentXML(t, content)
	for _, expected := range []string{"虚构成员", "00000001", "计算机科学与技术学院", "2026年10月19日", "第一大节课程", "000-0000"} {
		if !strings.Contains(xmlText, expected) {
			t.Errorf("generated leave document does not include %q", expected)
		}
	}
	if strings.Count(xmlText, "<w:drawing>") != 2 || !strings.Contains(xmlText, `r:embed="rId2"`) || !strings.Contains(xmlText, `r:embed="rId3"`) {
		t.Fatal("standard leave document must include the instructor signature and team seal")
	}
	for part, expected := range map[string][]byte{
		"word/media/instructor-signature.png": []byte("test instructor signature"),
		"word/media/team-seal.png":            []byte("test team seal"),
	} {
		actual, ok := documentPart(t, content, part)
		if !ok {
			t.Errorf("standard leave document is missing %q", part)
		} else if !bytes.Equal(actual, expected) {
			t.Errorf("standard leave document did not use the external asset for %q", part)
		}
	}
	offline, err := buildDailyLeaveDocx(start, end, profile, "计算机科学与技术学院", "000-0000", true)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(documentXML(t, offline), "<w:drawing>") {
		t.Fatal("offline leave document must omit the electronic signature and seal")
	}
	if _, ok := documentPart(t, offline, "word/media/instructor-signature.png"); ok {
		t.Fatal("offline leave document must omit the instructor signature asset")
	}
	if _, ok := documentPart(t, offline, "word/media/team-seal.png"); ok {
		t.Fatal("offline leave document must omit the team seal asset")
	}
}

func TestSchoolLeaveRunDocumentCreatesOnePagePerExactTimeGroup(t *testing.T) {
	setLeaveTemplateTestAssets(t)
	start := time.Date(2026, 10, 20, 10, 0, 0, 0, shanghai)
	end := start.Add(110 * time.Minute)
	run := model.SchoolLeaveRun{Reason: SchoolLeaveReason, CollectedAt: time.Date(2026, 10, 18, 13, 0, 0, 0, shanghai)}
	groups := []LeaveGroup{
		{Index: 1, StartAt: start, EndAt: end, Members: []LeaveGroupMember{{Name: "虚构甲", StudentID: "00000001"}}},
		{Index: 2, StartAt: start.AddDate(0, 0, 1), EndAt: end.AddDate(0, 0, 1), Members: []LeaveGroupMember{{Name: "虚构乙", StudentID: "00000002"}}},
	}
	content, err := buildSchoolLeaveRunDocx(run, groups, "000-0000")
	if err != nil {
		t.Fatal(err)
	}
	xmlText := documentXML(t, content)
	if strings.Count(xmlText, `w:type="page"`) != 1 {
		t.Fatalf("expected one explicit page break, got %d", strings.Count(xmlText, `w:type="page"`))
	}
	for _, expected := range []string{"虚构甲", "虚构乙", "00000001", "00000002"} {
		if !strings.Contains(xmlText, expected) {
			t.Errorf("generated batch document does not include %q", expected)
		}
	}
	if strings.Count(xmlText, "<w:drawing>") != 4 {
		t.Fatalf("expected signature and seal on each of the two pages; got %d drawings", strings.Count(xmlText, "<w:drawing>"))
	}
}

func TestStandardLeaveDocumentRequiresExternalTemplateAssets(t *testing.T) {
	t.Setenv("LEAVE_TEMPLATE_ASSET_DIR", "")
	_, err := buildDailyLeaveDocx(
		time.Date(2026, 10, 19, 8, 0, 0, 0, shanghai),
		time.Date(2026, 10, 19, 9, 50, 0, 0, shanghai),
		model.LeaveProfile{Name: "虚构成员", StudentID: "00000001"},
		"计算机科学与技术学院", "000-0000", false,
	)
	if err == nil || !strings.Contains(err.Error(), "LEAVE_TEMPLATE_ASSET_DIR") {
		t.Fatalf("expected a clear missing asset directory error, got %v", err)
	}
}

func TestCampLeaveDocumentIncludesSeasonDatesAndCollegeRoster(t *testing.T) {
	start := time.Date(2027, 1, 3, 0, 0, 0, 0, shanghai)
	event := model.CampLeaveEvent{Title: "虚构冬令营", Type: "winter", StartDate: start, EndDate: start.AddDate(0, 0, 10)}
	content, err := buildCampLeaveDocx(event, "计算机科学与技术学院", []CampDocumentMember{{Name: "虚构成员", StudentID: "00000001", CollegeName: "计算机科学与技术学院"}}, true)
	if err != nil {
		t.Fatal(err)
	}
	xmlText := documentXML(t, content)
	for _, expected := range []string{"虚构冬令营", "寒假", "2027年1月3日", "虚构成员", "00000001", "计算机科学与技术学院"} {
		if !strings.Contains(xmlText, expected) {
			t.Errorf("generated camp document does not include %q", expected)
		}
	}
}

func TestLeaveProfileAndDateValidation(t *testing.T) {
	if _, err := validateProfile(ProfileInput{Name: "虚构", StudentID: "1234567", CollegeCode: "computer-science-technology"}); err == nil {
		t.Fatal("expected invalid student ID to be rejected")
	}
	start := time.Date(2026, 10, 20, 9, 2, 0, 0, shanghai)
	end := start.Add(time.Hour)
	if err := validateRange(start, end, true); err == nil {
		t.Fatal("expected non-five-minute leave time to be rejected")
	}
	if err := validateRange(start, start, false); err == nil {
		t.Fatal("expected empty leave range to be rejected")
	}
}

func TestDailyLeaveCollectionCutoff(t *testing.T) {
	cutoff := 11*time.Hour + 30*time.Minute
	before := time.Date(2026, 10, 19, 11, 29, 59, 0, shanghai)
	due := time.Date(2026, 10, 19, 11, 30, 0, 0, shanghai)
	if shouldCollectDailyLeave(before, cutoff, "") {
		t.Fatal("collection must not run before the configured cutoff")
	}
	if !shouldCollectDailyLeave(due, cutoff, "") {
		t.Fatal("collection must run at the configured cutoff")
	}
	if shouldCollectDailyLeave(due.Add(time.Minute), cutoff, "2026-10-19") {
		t.Fatal("collection must run no more than once per day")
	}
}
