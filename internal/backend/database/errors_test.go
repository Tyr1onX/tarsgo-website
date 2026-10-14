package database

import (
	"errors"
	"fmt"
	"testing"

	mysqlDriver "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
)

func TestIsDuplicateKeyError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{name: "gorm translated error", err: gorm.ErrDuplicatedKey, want: true},
		{name: "mysql duplicate error", err: &mysqlDriver.MySQLError{Number: 1062}, want: true},
		{name: "wrapped mysql duplicate error", err: fmt.Errorf("insert user: %w", &mysqlDriver.MySQLError{Number: 1062}), want: true},
		{name: "other mysql error", err: &mysqlDriver.MySQLError{Number: 1064}, want: false},
		{name: "unrelated error", err: errors.New("connection unavailable"), want: false},
		{name: "nil error", err: nil, want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := IsDuplicateKeyError(test.err); got != test.want {
				t.Fatalf("IsDuplicateKeyError(%v) = %t, want %t", test.err, got, test.want)
			}
		})
	}
}
