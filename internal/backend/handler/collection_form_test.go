package handler

import (
	"strings"
	"testing"
	"time"

	"tarsgo-backend/model"
)

func testCollectionInput() collectionFormInput {
	login := true
	return collectionFormInput{
		Title: "培训报名", Status: "published", LoginRequired: &login, Capacity: 30,
		Fields: []model.CollectionField{
			{Key: "name", Label: "姓名", Type: "text", Required: true},
			{Key: "slot", Label: "场次", Type: "radio", Required: true,
				Options: []model.CollectionOption{{Label: "上午", Value: "am", Capacity: 2}, {Label: "下午", Value: "pm", Capacity: 1}}},
			{Key: "note", Label: "备注", Type: "textarea"},
		},
	}
}

func TestCollectionFormValidation(t *testing.T) {
	t.Run("valid", func(t *testing.T) {
		if err := validateCollectionForm(testCollectionInput()); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("duplicate option", func(t *testing.T) {
		v := testCollectionInput()
		v.Fields[1].Options[1].Value = "am"
		if err := validateCollectionForm(v); err == nil {
			t.Fatal("duplicate options must fail")
		}
	})
	t.Run("JSON path key", func(t *testing.T) {
		v := testCollectionInput()
		v.Fields[1].Key = "slot.bad"
		if err := validateCollectionForm(v); err == nil {
			t.Fatal("unsafe key must fail")
		}
	})
	t.Run("checkbox quota", func(t *testing.T) {
		v := testCollectionInput()
		v.Fields[1].Type = "checkbox"
		if err := validateCollectionForm(v); err == nil {
			t.Fatal("checkbox quota must fail")
		}
	})
	t.Run("deadline order", func(t *testing.T) {
		v := testCollectionInput()
		a, b := time.Now(), time.Now().Add(-time.Hour)
		v.OpensAt, v.ClosesAt = &a, &b
		if err := validateCollectionForm(v); err == nil {
			t.Fatal("inverted range must fail")
		}
	})
}

func TestCollectionAnswerValidation(t *testing.T) {
	fields := testCollectionInput().Fields
	answers, err := validateCollectionAnswers(fields, map[string]any{"name": "一团", "slot": "am"})
	if err != nil || answers["slot"] != "am" {
		t.Fatalf("valid answers = %#v, err %v", answers, err)
	}
	for _, bad := range []map[string]any{
		{"name": "一团", "slot": "unknown"},
		{"name": "一团", "slot": []any{"am"}},
		{"name": "一团"},
		{"name": strings.Repeat("a", 501), "slot": "am"},
	} {
		if _, err := validateCollectionAnswers(fields, bad); err == nil {
			t.Fatalf("invalid answers accepted: %#v", bad)
		}
	}
}

func TestCollectionExportReusesSafeCSV(t *testing.T) {
	if got := salonCSVCell("  =SUM(A1)"); got != "'  =SUM(A1)" {
		t.Fatalf("unsafe cell: %q", got)
	}
}
