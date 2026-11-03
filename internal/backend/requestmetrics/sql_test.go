package requestmetrics

import (
	"bytes"
	"context"
	"errors"
	"log"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestSQLMetricsIsolationConcurrentAndPrivate(t *testing.T) {
	var output bytes.Buffer
	old := log.Writer()
	log.SetOutput(&output)
	defer log.SetOutput(old)
	l := NewSQLLogger()
	ctx := WithSQL(context.Background())
	other := WithSQL(context.Background())
	expanded := func() (string, int64) { t.Error("SQL callback must never be expanded"); return "password=private", 1 }
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); l.Trace(ctx, time.Now(), expanded, nil) }()
	}
	wg.Wait()
	l.Trace(ctx, time.Now(), expanded, errors.New("credential=secret"))
	l.Trace(ctx, time.Now(), expanded, gorm.ErrRecordNotFound)
	got := ReadSQL(ctx)
	if got.Count != 52 || got.Errors != 1 || got.Elapsed <= 0 {
		t.Fatalf("metrics=%+v", got)
	}
	if ReadSQL(other).Count != 0 || ReadSQL(context.Background()).Count != 0 {
		t.Fatal("request metrics leaked")
	}
	if strings.Contains(output.String(), "secret") || strings.Contains(output.String(), "private") {
		t.Fatal("database log leaked values")
	}
	if !strings.Contains(output.String(), "error_type=") {
		t.Fatal("missing sanitized error diagnostic")
	}
	output.Reset()
	l.LogMode(logger.Silent).Trace(ctx, time.Now(), expanded, errors.New("secret"))
	if output.Len() != 0 || ReadSQL(ctx).Count != 53 {
		t.Fatal("silent log must retain metrics")
	}
}
