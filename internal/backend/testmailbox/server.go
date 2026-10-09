package testmailbox

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Message struct {
	ID          string              `json:"id"`
	ReceivedAt  time.Time           `json:"receivedAt"`
	From        string              `json:"from"`
	To          []string            `json:"to"`
	Subject     string              `json:"subject"`
	Text        string              `json:"text"`
	HTML        string              `json:"html"`
	Attachments []map[string]string `json:"attachments,omitempty"`
}

type store struct {
	mu       sync.Mutex
	path     string
	token    string
	messages []Message
}

func Handler(path, token string) (http.Handler, error) {
	if strings.TrimSpace(token) == "" {
		return nil, errors.New("mailbox token is required")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, fmt.Errorf("create mailbox directory: %w", err)
	}
	if err := os.Chmod(filepath.Dir(path), 0700); err != nil {
		return nil, fmt.Errorf("secure mailbox directory: %w", err)
	}
	s := &store{path: path, token: token}
	if err := s.load(); err != nil {
		return nil, err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /emails", s.receive)
	mux.HandleFunc("GET /", s.inbox)
	mux.HandleFunc("GET /api/messages", s.list)
	mux.HandleFunc("POST /admin/clear", s.clear)
	return mux, nil
}

func (s *store) load() error {
	file, err := os.Open(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("open mailbox store: %w", err)
	}
	defer file.Close()
	if err := os.Chmod(s.path, 0600); err != nil {
		return fmt.Errorf("secure mailbox store: %w", err)
	}
	decoder := json.NewDecoder(file)
	for {
		var message Message
		if err := decoder.Decode(&message); errors.Is(err, io.EOF) {
			break
		} else if err != nil {
			return fmt.Errorf("read mailbox store: %w", err)
		}
		s.messages = append(s.messages, message)
	}
	return nil
}

func (s *store) authorized(r *http.Request) bool {
	if r.Header.Get("Authorization") == "Bearer "+s.token {
		return true
	}
	user, password, ok := r.BasicAuth()
	return ok && user == "inbox" && password == s.token
}

func (s *store) receive(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "Bearer "+s.token {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 12<<20)
	var input struct {
		From        string              `json:"from"`
		To          []string            `json:"to"`
		Subject     string              `json:"subject"`
		Text        string              `json:"text"`
		HTML        string              `json:"html"`
		Attachments []map[string]string `json:"attachments"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid message", http.StatusBadRequest)
		return
	}
	if len(input.To) == 0 {
		http.Error(w, "recipient required", http.StatusBadRequest)
		return
	}
	for _, recipient := range input.To {
		if !isTestAddress(recipient) {
			http.Error(w, "mailbox accepts only @tarsgo.test recipients", http.StatusUnprocessableEntity)
			return
		}
	}
	idBytes := make([]byte, 16)
	if _, err := rand.Read(idBytes); err != nil {
		http.Error(w, "message id generation failed", http.StatusInternalServerError)
		return
	}
	message := Message{
		ID: hex.EncodeToString(idBytes), ReceivedAt: time.Now().UTC(), From: input.From,
		To: input.To, Subject: input.Subject, Text: input.Text, HTML: input.HTML, Attachments: input.Attachments,
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	file, err := os.OpenFile(s.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err == nil {
		_ = file.Chmod(0600)
		encoder := json.NewEncoder(file)
		err = encoder.Encode(message)
		if closeErr := file.Close(); err == nil {
			err = closeErr
		}
	}
	if err != nil {
		http.Error(w, "message store unavailable", http.StatusInternalServerError)
		return
	}
	s.messages = append(s.messages, message)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"id": message.ID})
}

func isTestAddress(raw string) bool {
	address, err := mail.ParseAddress(strings.TrimSpace(raw))
	if err != nil || address.Address != strings.TrimSpace(raw) {
		return false
	}
	parts := strings.Split(strings.ToLower(address.Address), "@")
	return len(parts) == 2 && parts[0] != "" && parts[1] == "tarsgo.test"
}

func (s *store) list(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		w.Header().Set("WWW-Authenticate", `Basic realm="TarsGo test mailbox"`)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	messages := append([]Message{}, s.messages...)
	_ = json.NewEncoder(w).Encode(messages)
}

func (s *store) inbox(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		w.Header().Set("WWW-Authenticate", `Basic realm="TarsGo test mailbox"`)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	s.mu.Lock()
	messages := append([]Message(nil), s.messages...)
	s.mu.Unlock()
	const page = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TarsGo 模拟收件箱</title><style>body{font:15px system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;background:#17191c;color:#eee}article{border:1px solid #444;border-radius:8px;padding:1rem;margin:1rem 0}small{color:#bbb}pre{white-space:pre-wrap;font:inherit}</style><h1>TarsGo 模拟收件箱</h1><p>仅保存本机测试邮件；只接受 @tarsgo.test 收件人。</p>{{range .}}<article><h2>{{.Subject}}</h2><small>{{.ReceivedAt}} · {{join .To ", "}}</small><pre>{{.Text}}</pre></article>{{else}}<p>暂无邮件。</p>{{end}}</html>`
	tmpl, err := template.New("inbox").Funcs(template.FuncMap{"join": strings.Join}).Parse(page)
	if err != nil {
		http.Error(w, "inbox unavailable", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := tmpl.Execute(w, messages); err != nil {
		return
	}
}

func (s *store) clear(w http.ResponseWriter, r *http.Request) {
	if !s.authorized(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.WriteFile(s.path, nil, 0600); err != nil && !errors.Is(err, os.ErrNotExist) {
		http.Error(w, "message store unavailable", http.StatusInternalServerError)
		return
	}
	s.messages = []Message{}
	w.WriteHeader(http.StatusNoContent)
}
