// Package requestmetrics collects request-local database operation totals.
package requestmetrics

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type contextKey struct{}

type SQL struct {
	mu      sync.Mutex
	count   int64
	elapsed time.Duration
	errors  int64
}

type Snapshot struct {
	Count   int64
	Elapsed time.Duration
	Errors  int64
}

func WithSQL(ctx context.Context) context.Context {
	return context.WithValue(ctx, contextKey{}, &SQL{})
}

func ReadSQL(ctx context.Context) Snapshot {
	metrics, _ := ctx.Value(contextKey{}).(*SQL)
	if metrics == nil {
		return Snapshot{}
	}
	metrics.mu.Lock()
	defer metrics.mu.Unlock()
	return Snapshot{metrics.count, metrics.elapsed, metrics.errors}
}

// SQLLogger never expands the SQL callback or prints SQL, parameters or error
// messages. Trace time includes GORM overhead and may overlap parent/preloads;
// it is not database CPU time or request wall time.
type SQLLogger struct {
	logger.Interface
	level logger.LogLevel
}

func NewSQLLogger() logger.Interface {
	return SQLLogger{Interface: logger.Default, level: logger.Warn}
}

func (l SQLLogger) LogMode(level logger.LogLevel) logger.Interface {
	l.level = level
	l.Interface = l.Interface.LogMode(level)
	return l
}

func (l SQLLogger) Trace(ctx context.Context, begin time.Time, _ func() (string, int64), err error) {
	elapsed := time.Since(begin)
	failed := err != nil && !errors.Is(err, gorm.ErrRecordNotFound)
	if metrics, ok := ctx.Value(contextKey{}).(*SQL); ok {
		metrics.mu.Lock()
		metrics.count++
		metrics.elapsed += elapsed
		if failed {
			metrics.errors++
		}
		metrics.mu.Unlock()
	}
	if failed && l.level >= logger.Error {
		log.Printf("database_operation elapsed=%s error_type=%T", elapsed, err)
	} else if elapsed >= 200*time.Millisecond && l.level >= logger.Warn {
		log.Printf("database_operation elapsed=%s slow=true", elapsed)
	}
}
