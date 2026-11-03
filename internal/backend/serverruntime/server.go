package serverruntime

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"net/http"
	"time"
)

// Header/idle budgets do not impose a wall-clock deadline on uploads or exports.
func Serve(ctx context.Context, address string, handler http.Handler) error {
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return err
	}
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second}
	return serve(ctx, listener, server, 8*time.Second)
}

func serve(ctx context.Context, listener net.Listener, server *http.Server, grace time.Duration) error {
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	select {
	case err := <-done:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		// This independent context lets active requests finish after SIGTERM. Eight
		// seconds fits inside Docker Compose's default ten-second stop grace period.
		drain, cancel := context.WithTimeout(context.Background(), grace)
		defer cancel()
		err := server.Shutdown(drain)
		if err != nil {
			_ = server.Close()
		}
		<-done
		if err != nil {
			return fmt.Errorf("HTTP shutdown: %w", err)
		}
		return nil
	}
}

// Pool counters are process-wide, not per-request attribution. Log only counts
// and durations, never SQL, connection strings, account identifiers or content.
func StartPoolStats(ctx context.Context, db *sql.DB, logf func(string, ...any)) {
	go func() {
		previous := db.Stats()
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				current := db.Stats()
				logf("database_pool open=%d in_use=%d idle=%d max_open=%d wait_count_delta=%d wait_duration_delta=%s", current.OpenConnections, current.InUse, current.Idle, current.MaxOpenConnections, current.WaitCount-previous.WaitCount, current.WaitDuration-previous.WaitDuration)
				previous = current
			}
		}
	}()
}
