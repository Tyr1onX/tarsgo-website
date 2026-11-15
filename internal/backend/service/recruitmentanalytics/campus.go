package recruitmentanalytics

import "strings"

const unknownCampus = "校区未识别"

// College-level estimates for recruitment reporting. A college can have
// facilities on several campuses; these assignments follow JLU undergraduate
// arrangements, not a student's actual residence or current class location.
// Sources: https://csw.jlu.edu.cn/info/1095/8569.htm
//          https://www.jlu.edu.cn/info/1240/45864.m.htm
var collegeCampuses = map[string]string{
	"通信工程学院":       "南湖校区",
	"通信学院":         "南湖校区",
	"预科教育学院":       "南湖校区",
	"机械与航空航天工程学院":  "南岭校区",
	"机械与航天航空工程学院":  "南岭校区",
	"汽车工程学院":       "南岭校区",
	"材料科学与工程学院":    "南岭校区",
	"交通学院":         "南岭校区",
	"生物与农业工程学院":    "南岭校区",
	"仿生科学与工程学院":    "南岭校区",
	"电子科学与工程学院":    "前卫南区",
	"计算机科学与技术学院":   "前卫南区",
	"软件学院":         "前卫南区",
	"数学学院":         "前卫南区",
	"物理学院":         "前卫南区",
	"人工智能学院":       "前卫南区",
	"商学与管理学院":      "前卫南区",
	"经济学院":         "前卫南区",
	"生命科学学院":       "前卫南区",
	"化学学院":         "前卫南区",
	"仪器科学与电气工程学院":  "朝阳校区",
	"地球探测科学与技术学院":  "朝阳校区",
	"地球科学学院":       "朝阳校区",
	"建设工程学院":       "朝阳校区",
	"公共卫生学院":       "新民校区",
	"基础医学院":        "新民校区",
	"护理学院":         "新民校区",
	"药学院":          "新民校区",
	"动物医学学院":       "和平校区",
	"动物科学学院":       "和平校区",
	"植物科学学院":       "和平校区",
	"食品科学与工程学院":    "和平校区",
	"新能源与环境学院":     "前卫北区",
}

// Only match full college names in mixed "college + major" free text.
// If multiple campuses are mentioned, do not invent one.
func campusForCollege(value string) string {
	value = strings.Join(strings.Fields(value), "")
	var result string
	for college, campus := range collegeCampuses {
		if strings.Contains(value, college) {
			if result != "" && result != campus {
				return unknownCampus
			}
			result = campus
		}
	}
	if result != "" {
		return result
	}
	switch value {
	case "数学":
		return "前卫南区"
	case "交通":
		return "南岭校区"
	}
	return unknownCampus
}
