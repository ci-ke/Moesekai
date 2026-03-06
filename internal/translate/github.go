package translate

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

const githubAPIVersion = "2022-11-28"

// GitHubPusher handles triggering translation sync workflow on GitHub Actions.
type GitHubPusher struct {
	mu           sync.Mutex
	token        string
	repo         string // owner/repo
	workflowFile string // workflow filename, e.g. sync-translations-from-deploy.yml
	workflowRef  string // branch or tag to dispatch on
	lastPush     time.Time
	lastError    string
	pushing      bool
	httpClient   *http.Client
}

// PushStatus represents the current push status
type PushStatus struct {
	LastPush  string `json:"lastPush"`
	LastError string `json:"lastError,omitempty"`
	Pushing   bool   `json:"pushing"`
}

// NewGitHubPusher creates a new GitHub workflow dispatcher.
func NewGitHubPusher(token, repo, workflowFile, workflowRef string) *GitHubPusher {
	if strings.TrimSpace(workflowRef) == "" {
		workflowRef = "main"
	}

	return &GitHubPusher{
		token:        strings.TrimSpace(token),
		repo:         strings.TrimSpace(repo),
		workflowFile: strings.TrimSpace(workflowFile),
		workflowRef:  strings.TrimSpace(workflowRef),
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

type workflowDispatchRequest struct {
	Ref string `json:"ref"`
}

// Push dispatches a GitHub Actions workflow run.
func (g *GitHubPusher) Push(username string) error {
	g.mu.Lock()
	if g.pushing {
		g.mu.Unlock()
		return fmt.Errorf("push already in progress")
	}
	g.pushing = true
	g.mu.Unlock()

	defer func() {
		g.mu.Lock()
		g.pushing = false
		g.mu.Unlock()
	}()

	if err := g.validateConfig(); err != nil {
		g.mu.Lock()
		g.lastError = err.Error()
		g.mu.Unlock()
		return err
	}

	body, err := json.Marshal(workflowDispatchRequest{Ref: g.workflowRef})
	if err != nil {
		g.mu.Lock()
		g.lastError = fmt.Sprintf("marshal dispatch request failed: %v", err)
		g.mu.Unlock()
		return fmt.Errorf("marshal dispatch request: %w", err)
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/actions/workflows/%s/dispatches", g.repo, g.workflowFile)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		g.mu.Lock()
		g.lastError = fmt.Sprintf("build dispatch request failed: %v", err)
		g.mu.Unlock()
		return fmt.Errorf("build dispatch request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+g.token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", githubAPIVersion)
	req.Header.Set("Content-Type", "application/json")

	resp, err := g.httpClient.Do(req)
	if err != nil {
		g.mu.Lock()
		g.lastError = fmt.Sprintf("dispatch request failed: %v", err)
		g.mu.Unlock()
		return fmt.Errorf("dispatch request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		errMsg := fmt.Sprintf("dispatch failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
		g.mu.Lock()
		g.lastError = errMsg
		g.mu.Unlock()
		return fmt.Errorf(errMsg)
	}

	g.mu.Lock()
	g.lastPush = time.Now()
	g.lastError = ""
	g.mu.Unlock()

	fmt.Printf("[translate] Successfully dispatched workflow %s (ref=%s, by %s)\n", g.workflowFile, g.workflowRef, username)
	return nil
}

// GetStatus returns the current push status
func (g *GitHubPusher) GetStatus() PushStatus {
	g.mu.Lock()
	defer g.mu.Unlock()

	status := PushStatus{
		Pushing:   g.pushing,
		LastError: g.lastError,
	}
	if !g.lastPush.IsZero() {
		status.LastPush = g.lastPush.Format(time.RFC3339)
	}
	return status
}

// StartScheduledPush starts a goroutine that pushes every interval
func (g *GitHubPusher) StartScheduledPush(interval time.Duration) {
	if err := g.validateConfig(); err != nil {
		g.mu.Lock()
		g.lastError = "scheduled push disabled: " + err.Error()
		g.mu.Unlock()
		fmt.Printf("[translate] Scheduled push disabled: %v\n", err)
		return
	}

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			fmt.Println("[translate] Scheduled push check...")
			if err := g.Push("scheduled"); err != nil {
				fmt.Printf("[translate] Scheduled push error: %v\n", err)
			}
		}
	}()
	fmt.Printf("[translate] Scheduled push started (every %v)\n", interval)
}

func (g *GitHubPusher) validateConfig() error {
	if strings.TrimSpace(g.token) == "" {
		return fmt.Errorf("GITHUB_TOKEN is empty")
	}
	if strings.TrimSpace(g.repo) == "" {
		return fmt.Errorf("GITHUB_REPO is empty (expected owner/repo)")
	}
	if !strings.Contains(g.repo, "/") {
		return fmt.Errorf("GITHUB_REPO must be owner/repo")
	}
	if strings.TrimSpace(g.workflowFile) == "" {
		return fmt.Errorf("GITHUB_WORKFLOW_FILE is empty")
	}
	if strings.TrimSpace(g.workflowRef) == "" {
		return fmt.Errorf("GITHUB_WORKFLOW_REF is empty")
	}
	return nil
}
