package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"runtime/debug"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
)

const (
	requestIDHeader          = "X-Request-ID"
	requestIDContextKey      = "requestID"
	requestStartedContextKey = "requestStartedAt"
)

var (
	requestIDFallback  atomic.Uint64
	sensitiveHeaderLog = regexp.MustCompile(`(?i)\b(cookie|set-cookie|authorization)\s*:\s*[^\r\n]*`)
	sensitiveValueLog  = regexp.MustCompile(`(?i)\b(tarsgo_token|password|passwd|cookie|authorization|token|secret|session)\b["']?\s*([=:])\s*[^\s,;&"']+`)
	bearerValueLog     = regexp.MustCompile(`(?i)\bbearer\s+[a-z0-9._~+/-]+=*`)
	jwtValueLog        = regexp.MustCompile(`\beyJ[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,}\b`)
)

// RequestTracing assigns a server-generated correlation ID to every request.
// It intentionally ignores caller-supplied IDs and never records headers or bodies.
func RequestTracing() gin.HandlerFunc {
	return func(c *gin.Context) {
		startedAt := time.Now().UTC()
		requestID := newRequestID(startedAt)
		c.Set(requestIDContextKey, requestID)
		c.Set(requestStartedContextKey, startedAt)
		c.Header(requestIDHeader, requestID)
		c.Next()
	}
}

func RequestLogFormatter(param gin.LogFormatterParams) string {
	requestID, _ := param.Keys[requestIDContextKey].(string)
	path := "-"
	if param.Request != nil && param.Request.URL != nil && param.Request.URL.Path != "" {
		path = param.Request.URL.Path
	}
	return fmt.Sprintf("time=%s request_id=%s method=%s path=%q status=%d latency=%s\n",
		param.TimeStamp.UTC().Format(time.RFC3339Nano), requestID, param.Method, path, param.StatusCode, param.Latency)
}

// LogInternalError writes diagnostic context without logging request headers,
// query strings, bodies, or uploaded file contents.
func LogInternalError(c *gin.Context, operation string, status int, err error) {
	startedAt := time.Time{}
	if value, ok := c.Get(requestStartedContextKey); ok {
		if timestamp, ok := value.(time.Time); ok {
			startedAt = timestamp
		}
	}
	requestID, _ := c.Get(requestIDContextKey)
	path := "-"
	method := "-"
	if c.Request != nil && c.Request.URL != nil && c.Request.URL.Path != "" {
		path = c.Request.URL.Path
	}
	if c.Request != nil {
		method = c.Request.Method
	}
	route := c.FullPath()
	errorType := "unknown"
	reason := "unknown"
	if err != nil {
		errorType = fmt.Sprintf("%T", err)
		reason = err.Error()
	}
	log.Printf("server_error time=%s request_started_at=%s request_id=%s method=%s path=%q route=%q status=%d operation=%q error_type=%q reason=%q",
		time.Now().UTC().Format(time.RFC3339Nano), timestampValue(startedAt), safeLogValue(fmt.Sprint(requestID)),
		method, safeLogValue(path), safeLogValue(route), status, safeLogValue(operation), safeLogValue(errorType), safeLogValue(reason))
}

// RecoveryWithRequestID replaces Gin's default recovery logger, which can dump
// request headers on broken connections. Panic logs contain only the error type,
// a redacted reason and a stack trace keyed by the request ID.
func RecoveryWithRequestID() gin.HandlerFunc {
	return gin.CustomRecoveryWithWriter(nil, func(c *gin.Context, recovered any) {
		var panicErr error
		if err, ok := recovered.(error); ok {
			panicErr = err
		} else {
			panicErr = fmt.Errorf("panic value type %T", recovered)
		}
		LogInternalError(c, "panic recovery", http.StatusInternalServerError, panicErr)
		if requestID, ok := c.Get(requestIDContextKey); ok {
			log.Printf("server_error_stack request_id=%s stack=%q", safeLogValue(fmt.Sprint(requestID)), safeLogValue(string(debug.Stack())))
		}
		if errors.Is(panicErr, syscall.EPIPE) || errors.Is(panicErr, syscall.ECONNRESET) || errors.Is(panicErr, http.ErrAbortHandler) {
			c.Abort()
			return
		}
		writeAPIError(c, http.StatusInternalServerError, "服务器内部错误")
	})
}

func newRequestID(startedAt time.Time) string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err == nil {
		return hex.EncodeToString(value[:])
	}
	return fmt.Sprintf("%x-%x", startedAt.UnixNano(), requestIDFallback.Add(1))
}

func timestampValue(value time.Time) string {
	if value.IsZero() {
		return "unknown"
	}
	return value.UTC().Format(time.RFC3339Nano)
}

func safeLogValue(value string) string {
	value = strings.ToValidUTF8(value, "�")
	value = sensitiveHeaderLog.ReplaceAllString(value, "$1=[REDACTED]")
	value = sensitiveValueLog.ReplaceAllString(value, "$1$2[REDACTED]")
	value = bearerValueLog.ReplaceAllString(value, "Bearer [REDACTED]")
	value = jwtValueLog.ReplaceAllString(value, "[REDACTED_TOKEN]")
	var cleaned strings.Builder
	for _, character := range value {
		if unicode.IsControl(character) {
			if character == '\n' || character == '\r' || character == '\t' {
				cleaned.WriteByte(' ')
			}
			continue
		}
		cleaned.WriteRune(character)
	}
	value = cleaned.String()
	if len(value) > 1024 {
		value = value[:1024] + "…"
		value = strings.ToValidUTF8(value, "�")
	}
	return value
}
