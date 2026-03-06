package translate

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// Handler holds dependencies for translation API handlers
type Handler struct {
	store  *Store
	auth   *Auth
	pusher *GitHubPusher
}

// NewHandler creates a new translation API handler
func NewHandler(store *Store, auth *Auth, pusher *GitHubPusher) *Handler {
	return &Handler{
		store:  store,
		auth:   auth,
		pusher: pusher,
	}
}

// RegisterRoutes registers translation API routes on the given mux
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	// Public
	mux.HandleFunc("/api/translate/login", h.handleLogin)
	// Protected
	mux.HandleFunc("/api/translate/categories", h.auth.AuthMiddleware(h.handleCategories))
	mux.HandleFunc("/api/translate/entries", h.auth.AuthMiddleware(h.handleEntries))
	mux.HandleFunc("/api/translate/entry", h.auth.AuthMiddleware(h.handleUpdateEntry))
	mux.HandleFunc("/api/translate/push", h.auth.AuthMiddleware(h.handlePush))
	mux.HandleFunc("/api/translate/status", h.auth.AuthMiddleware(h.handleStatus))
}

// POST /api/translate/login
func (h *Handler) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if !h.auth.Authenticate(req.Username, req.Password) {
		http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
		return
	}

	token, err := h.auth.GenerateToken(req.Username)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"token":    token,
		"username": req.Username,
	})
}

// GET /api/translate/categories
func (h *Handler) handleCategories(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.store.GetCategories())
}

// GET /api/translate/entries?category=cards&field=prefix&source=llm
func (h *Handler) handleEntries(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	category := r.URL.Query().Get("category")
	field := r.URL.Query().Get("field")
	source := r.URL.Query().Get("source") // optional filter

	if category == "" || field == "" {
		http.Error(w, `{"error":"category and field are required"}`, http.StatusBadRequest)
		return
	}

	if !isValidCategory(category) {
		http.Error(w, fmt.Sprintf(`{"error":"unsupported category: %s"}`, category), http.StatusBadRequest)
		return
	}

	entries := h.store.GetEntries(category, field, source)
	if entries == nil {
		entries = []EntryWithKey{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

// PUT /api/translate/entry
func (h *Handler) handleUpdateEntry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Category string `json:"category"`
		Field    string `json:"field"`
		Key      string `json:"key"`
		Text     string `json:"text"`
		Source   string `json:"source"` // "human" or "pinned"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Category == "" || req.Field == "" || req.Key == "" {
		http.Error(w, `{"error":"category, field, and key are required"}`, http.StatusBadRequest)
		return
	}

	if !isValidCategory(req.Category) {
		http.Error(w, fmt.Sprintf(`{"error":"unsupported category: %s"}`, req.Category), http.StatusBadRequest)
		return
	}

	// Default source to human if not specified
	if req.Source == "" {
		req.Source = SourceHuman
	}
	if !isValidSource(req.Source) {
		http.Error(w, `{"error":"invalid source type"}`, http.StatusBadRequest)
		return
	}

	username := r.Header.Get("X-Translator-Username")

	updated, err := h.store.UpdateEntry(req.Category, req.Field, req.Key, req.Text, req.Source)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	fmt.Printf("[translate] %s updated %s.%s (source=%s keyChars=%d textChars=%d updated=%t)\n",
		username, req.Category, req.Field, req.Source, len([]rune(req.Key)), len([]rune(req.Text)), updated)

	w.Header().Set("Content-Type", "application/json")
	status := "ok"
	if !updated {
		status = "noop"
	}
	json.NewEncoder(w).Encode(map[string]string{"status": status})
}

// POST /api/translate/push
func (h *Handler) handlePush(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	username := r.Header.Get("X-Translator-Username")
	fmt.Printf("[translate] Manual push triggered by %s\n", username)

	if err := h.pusher.Push(username); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "pushed"})
}

// GET /api/translate/status
func (h *Handler) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.pusher.GetStatus())
}
