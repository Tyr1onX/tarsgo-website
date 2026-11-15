package recruitmentanalytics

import "testing"

func TestCampusForCollegeMatchesFullNamesAndHandlesUnknown(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"通信工程学院 通信工程专业", "南湖校区"},
		{"机械与航天航空工程学院-机械设计", "南岭校区"},
		{"生物与农业工程学院 仿生科学与工程学院", "南岭校区"},
		{"电子科学与工程学院 微电子", "前卫南区"},
		{"计算机科学与技术学院 软件工程", "前卫南区"},
		{"公共卫生学院-预防医学", "新民校区"},
		{"仪器科学与电气工程学院", "朝阳校区"},
		{"食品科学与工程学院", "和平校区"},
		{"新能源与环境学院", "前卫北区"},
		{"数学", "前卫南区"},
		{"交通", "南岭校区"},
		{"  ", unknownCampus},
		{"自动化专业", unknownCampus},
		{"通信工程学院 + 计算机科学与技术学院", unknownCampus},
	}
	for _, test := range tests {
		t.Run(test.input, func(t *testing.T) {
			if got := campusForCollege(test.input); got != test.want {
				t.Fatalf("campusForCollege(%q) = %q; want %q", test.input, got, test.want)
			}
		})
	}
}
