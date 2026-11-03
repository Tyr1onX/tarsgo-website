package config

import (
	"github.com/go-sql-driver/mysql"
	"testing"
	"time"
)

func TestDSNBoundsConnectWithoutTruncatingLongQueries(t *testing.T) {
	cfg := DatabaseConfig{User: "test", Password: "synthetic", Host: "127.0.0.1", Port: "3317", Name: "test", Charset: "utf8mb4", Loc: "UTC", ParseTime: true}
	parsed, err := mysql.ParseDSN(cfg.DSN())
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Timeout != 5*time.Second || parsed.ReadTimeout != 0 || parsed.WriteTimeout != 0 {
		t.Fatalf("unexpected budgets: connect=%s read=%s write=%s", parsed.Timeout, parsed.ReadTimeout, parsed.WriteTimeout)
	}
}
