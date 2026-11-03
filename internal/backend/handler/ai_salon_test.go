package handler

import "testing"

func TestSalonCSVFormulaProtection(t *testing.T) {
	for _, value := range []string{"=HYPERLINK(\"https://test\")", " +123", "\t@SUM(A1)", "-1"} {
		if got := salonCSVCell(value); got != "'"+value {
			t.Fatalf("unsafe CSV cell: %q", got)
		}
	}
	if got := salonCSVCell("测试学院"); got != "测试学院" {
		t.Fatal(got)
	}
}
