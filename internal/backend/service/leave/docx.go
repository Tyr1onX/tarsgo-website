package leave

import (
	"archive/zip"
	"bytes"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"strings"
	"time"

	"tarsgo-backend/model"
)

const docxMIMEType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

type CampDocumentMember struct {
	Name        string
	StudentID   string
	CollegeName string
}

func buildSchoolLeaveDocx(run model.SchoolLeaveRun, group LeaveGroup, phone string) ([]byte, error) {
	return buildLeaveDocx([]docPage{schoolPage(run, group, phone)})
}

func buildSchoolLeaveRunDocx(run model.SchoolLeaveRun, groups []LeaveGroup, phone string) ([]byte, error) {
	if len(groups) == 0 {
		return nil, fmt.Errorf("请假名单为空")
	}
	pages := make([]docPage, 0, len(groups))
	for _, group := range groups {
		pages = append(pages, schoolPage(run, group, phone))
	}
	return buildLeaveDocx(pages)
}

func schoolPage(run model.SchoolLeaveRun, group LeaveGroup, phone string) docPage {
	rows := make([][]string, 0, len(group.Members))
	for _, member := range group.Members {
		rows = append(rows, []string{member.Name, member.StudentID})
	}
	return docPage{
		Title: "请假条",
		Paragraphs: []string{
			fmt.Sprintf("以下学生因参加%s的%s，不能参加%s，特此证明。", documentTimeText(group.StartAt, group.EndAt), run.Reason, coursePeriod(group.StartAt, group.EndAt)),
		},
		TableHead: []string{"姓名", "学号"}, TableRows: rows,
		Phone: phone, IssuedAt: run.CollectedAt,
	}
}

func buildDailyLeaveDocx(startAt, endAt time.Time, profile model.LeaveProfile, collegeName, phone string, offline bool) ([]byte, error) {
	issued := time.Now().In(shanghai)
	return buildLeaveDocx([]docPage{{
		Title:      "请假条",
		Paragraphs: []string{fmt.Sprintf("以下学生因参加%s的%s，不能参加%s，特此证明。", documentTimeText(startAt, endAt), SchoolLeaveReason, coursePeriod(startAt, endAt))},
		TableHead:  []string{"姓名", "学号", "学院"},
		TableRows:  [][]string{{profile.Name, profile.StudentID, collegeName}},
		Phone:      phone, IssuedAt: issued, Offline: offline,
	}})
}

func buildCampLeaveDocx(event model.CampLeaveEvent, collegeName string, members []CampDocumentMember, offline bool) ([]byte, error) {
	season := "寒假"
	if event.Type == "summer" {
		season = "暑假"
	}
	rows := make([][]string, 0, len(members))
	for index, member := range members {
		rows = append(rows, []string{fmt.Sprint(index + 1), member.Name, member.StudentID, member.CollegeName})
	}
	return buildLeaveDocx([]docPage{{
		Title:      "留校申请书",
		Paragraphs: []string{fmt.Sprintf("兹有以下学生，因参与即将举行的“%s”，需%s留校进行机器人的设计、编程、测试，时间是%s到%s。为确保留校期间安全、高效有序，吉甲大师双创基地已安排指导教师全程负责学生的日常管理，包括早晚签到，并进行全天候的实验室活动安排。", event.Title, season, event.StartDate.In(shanghai).Format("2006年1月2日"), event.EndDate.In(shanghai).Format("2006年1月2日"))},
		TableHead:  []string{"序号", "姓名", "学号", "学院"}, TableRows: rows,
		Phone: strings.TrimSpace(getContactPhone()), IssuedAt: time.Now().In(shanghai), Offline: offline,
		Signoff: "望批准", College: collegeName,
	}})
}

// docPage is the small shared model used for the three existing leave forms.
type docPage struct {
	Title      string
	Paragraphs []string
	TableHead  []string
	TableRows  [][]string
	Phone      string
	IssuedAt   time.Time
	Offline    bool
	Signoff    string
	College    string
}

func buildLeaveDocx(pages []docPage) ([]byte, error) {
	if len(pages) == 0 {
		return nil, fmt.Errorf("请假材料为空")
	}
	var body strings.Builder
	drawingID := 1
	hasImages := false
	for pageIndex, page := range pages {
		if !page.Offline {
			hasImages = true
		}
		if pageIndex > 0 {
			body.WriteString(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`)
		}
		writeParagraph(&body, page.Title, "center", 36, true, 200)
		for _, paragraph := range page.Paragraphs {
			writeParagraph(&body, paragraph, "left", 24, false, 180)
		}
		if page.Signoff != "" {
			writeParagraph(&body, page.Signoff, "right", 24, false, 40)
		}
		writeTable(&body, page.TableHead, page.TableRows)
		writeSignatureParagraph(&body, page.Offline, &drawingID)
		if page.Phone != "" {
			writeParagraph(&body, "联系电话："+page.Phone, "right", 24, false, 40)
		}
		if !page.IssuedAt.IsZero() {
			writeParagraph(&body, fmt.Sprintf("%d年%d月%d日", page.IssuedAt.Year(), page.IssuedAt.Month(), page.IssuedAt.Day()), "right", 24, false, 0)
		}
	}
	var instructorSignature, teamSeal []byte
	if hasImages {
		var err error
		instructorSignature, teamSeal, err = loadLeaveTemplateAssets()
		if err != nil {
			return nil, err
		}
	}
	content := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>` + body.String() + `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
	var output bytes.Buffer
	w := zip.NewWriter(&output)
	contentTypes := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
	if hasImages {
		contentTypes += `<Default Extension="png" ContentType="image/png"/>`
	}
	contentTypes += `</Types>`
	documentRelationships := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
	if hasImages {
		documentRelationships += `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/instructor-signature.png"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/team-seal.png"/>`
	}
	documentRelationships += `</Relationships>`
	files := []struct {
		name string
		data []byte
	}{
		{"[Content_Types].xml", []byte(contentTypes)},
		{"_rels/.rels", []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`)},
		{"word/_rels/document.xml.rels", []byte(documentRelationships)},
		{"word/document.xml", []byte(content)},
		{"word/styles.xml", []byte(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:eastAsia="宋体"/><w:lang w:val="zh-CN" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`)},
	}
	if hasImages {
		files = append(files,
			struct {
				name string
				data []byte
			}{"word/media/instructor-signature.png", instructorSignature},
			struct {
				name string
				data []byte
			}{"word/media/team-seal.png", teamSeal},
		)
	}
	for _, file := range files {
		entry, err := w.Create(file.name)
		if err != nil {
			return nil, err
		}
		if _, err := entry.Write(file.data); err != nil {
			return nil, err
		}
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func loadLeaveTemplateAssets() ([]byte, []byte, error) {
	assetDir := strings.TrimSpace(os.Getenv("LEAVE_TEMPLATE_ASSET_DIR"))
	if assetDir == "" {
		return nil, nil, fmt.Errorf("请假签章素材目录未配置：请设置 LEAVE_TEMPLATE_ASSET_DIR")
	}
	readAsset := func(name string) ([]byte, error) {
		path := filepath.Join(assetDir, name)
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("读取请假签章素材 %s 失败：%w", name, err)
		}
		if len(data) == 0 {
			return nil, fmt.Errorf("请假签章素材 %s 为空", name)
		}
		return data, nil
	}
	instructorSignature, err := readAsset("instructor-signature.png")
	if err != nil {
		return nil, nil, err
	}
	teamSeal, err := readAsset("team-seal.png")
	if err != nil {
		return nil, nil, err
	}
	return instructorSignature, teamSeal, nil
}

func writeSignatureParagraph(body *strings.Builder, offline bool, drawingID *int) {
	body.WriteString(`<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="40" w:line="1474" w:lineRule="exact"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr><w:t>指导教师：</w:t></w:r>`)
	if offline {
		body.WriteString(`<w:r><w:t xml:space="preserve">                         </w:t></w:r>`)
	} else {
		writeInlineImage(body, "rId2", "指导教师签名", *drawingID, 0.89, 126, 45)
		*drawingID++
		writeInlineImage(body, "rId3", "团队印章", *drawingID, 1.10, 447, 416)
		*drawingID++
	}
	body.WriteString(`</w:p>`)
}

func writeInlineImage(body *strings.Builder, relationshipID, name string, drawingID int, widthInches float64, pixelWidth, pixelHeight int) {
	cx := int(widthInches * 914400)
	cy := cx * pixelHeight / pixelWidth
	fmt.Fprintf(body, `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="%d" cy="%d"/><wp:docPr id="%d" name="%s"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="%d" name="%s"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="%s"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`, cx, cy, drawingID, html.EscapeString(name), drawingID, html.EscapeString(name), relationshipID, cx, cy)
}

func writeParagraph(body *strings.Builder, text, alignment string, fontSize int, bold bool, after int) {
	boldXML := ""
	if bold {
		boldXML = "<w:b/>"
	}
	fmt.Fprintf(body, `<w:p><w:pPr><w:jc w:val="%s"/><w:spacing w:after="%d"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="宋体" w:hAnsi="宋体" w:eastAsia="宋体"/>%s<w:sz w:val="%d"/></w:rPr><w:t xml:space="preserve">%s</w:t></w:r></w:p>`, alignment, after, boldXML, fontSize, html.EscapeString(text))
}

func writeTable(body *strings.Builder, headers []string, rows [][]string) {
	body.WriteString(`<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="6"/><w:left w:val="single" w:sz="6"/><w:bottom w:val="single" w:sz="6"/><w:right w:val="single" w:sz="6"/><w:insideH w:val="single" w:sz="6"/><w:insideV w:val="single" w:sz="6"/></w:tblBorders><w:tblW w:w="0" w:type="auto"/></w:tblPr>`)
	writeTableRow(body, headers, true)
	for _, row := range rows {
		writeTableRow(body, row, false)
	}
	body.WriteString(`</w:tbl>`)
}

func writeTableRow(body *strings.Builder, values []string, header bool) {
	body.WriteString(`<w:tr>`)
	for _, value := range values {
		bold := ""
		if header {
			bold = "<w:b/>"
		}
		fmt.Fprintf(body, `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:eastAsia="宋体"/><w:sz w:val="22"/>%s</w:rPr><w:t xml:space="preserve">%s</w:t></w:r></w:p></w:tc>`, bold, html.EscapeString(value))
	}
	body.WriteString(`</w:tr>`)
}

func documentTimeText(startAt, endAt time.Time) string {
	startAt, endAt = startAt.In(shanghai), endAt.In(shanghai)
	if startAt.YearDay() == endAt.YearDay() && startAt.Year() == endAt.Year() {
		return fmt.Sprintf("%d年%d月%d日 %s 至 %s", startAt.Year(), startAt.Month(), startAt.Day(), startAt.Format("15:04"), endAt.Format("15:04"))
	}
	return fmt.Sprintf("%d年%d月%d日 %s 至 %d年%d月%d日 %s", startAt.Year(), startAt.Month(), startAt.Day(), startAt.Format("15:04"), endAt.Year(), endAt.Month(), endAt.Day(), endAt.Format("15:04"))
}

func getContactPhone() string {
	return strings.TrimSpace(os.Getenv("LEAVE_CONTACT_PHONE"))
}
