package weeklyreport

import (
	"mime/multipart"
	"testing"

	"tarsgo-backend/model"
	"tarsgo-backend/service/privatefile"
)

func TestExceedsAttachmentTotal(t *testing.T) {
	tests := []struct {
		name     string
		existing []model.WeeklyReportAttachment
		uploads  []int64
		exceeded bool
	}{
		{
			name:     "allows exactly 50 MB across uploads",
			existing: []model.WeeklyReportAttachment{{Size: 30 << 20}},
			uploads:  []int64{20 << 20},
		},
		{
			name:     "rejects a later upload that exceeds the report total",
			existing: []model.WeeklyReportAttachment{{Size: 40 << 20}},
			uploads:  []int64{10<<20 + 1},
			exceeded: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			uploads := make([]privatefile.Upload, 0, len(test.uploads))
			for _, size := range test.uploads {
				uploads = append(uploads, privatefile.Upload{Header: &multipart.FileHeader{Size: size}})
			}
			if got := exceedsAttachmentTotal(test.existing, uploads); got != test.exceeded {
				t.Fatalf("exceedsAttachmentTotal() = %t, want %t", got, test.exceeded)
			}
		})
	}
}
