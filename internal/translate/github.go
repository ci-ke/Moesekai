package translate

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// GitHubPusher handles pushing translation changes to GitHub
type GitHubPusher struct {
	mu             sync.Mutex
	repoPath       string // path to the git repo root
	translationDir string // relative path within repo (web/public/data/translations)
	pushBranch     string
	lastPush       time.Time
	lastError      string
	pushing        bool
}

// PushStatus represents the current push status
type PushStatus struct {
	LastPush  string `json:"lastPush"`
	LastError string `json:"lastError,omitempty"`
	Pushing   bool   `json:"pushing"`
}

// NewGitHubPusher creates a new GitHub pusher
func NewGitHubPusher(repoPath, translationDir, pushBranch string) *GitHubPusher {
	if strings.TrimSpace(pushBranch) == "" {
		pushBranch = "main"
	}

	return &GitHubPusher{
		repoPath:       repoPath,
		translationDir: filepath.FromSlash(translationDir),
		pushBranch:     pushBranch,
	}
}

// Push commits and pushes translation changes to GitHub
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

	if err := g.ensureReady(); err != nil {
		g.mu.Lock()
		g.lastError = err.Error()
		g.mu.Unlock()
		return err
	}

	// Check if there are any changes
	hasChanges, err := g.hasGitChanges()
	if err != nil {
		g.mu.Lock()
		g.lastError = fmt.Sprintf("git status failed: %v", err)
		g.mu.Unlock()
		return fmt.Errorf("git status: %w", err)
	}

	if !hasChanges {
		fmt.Println("[translate] No translation changes to push")
		return nil
	}

	// Stage translation files
	if err := g.runGit("add", "--", g.translationDir); err != nil {
		g.mu.Lock()
		g.lastError = fmt.Sprintf("git add failed: %v", err)
		g.mu.Unlock()
		return fmt.Errorf("git add: %w", err)
	}

	// Commit
	msg := fmt.Sprintf("chore: update translations (by %s)", username)
	if err := g.runGit("commit", "-m", msg); err != nil {
		g.mu.Lock()
		g.lastError = fmt.Sprintf("git commit failed: %v", err)
		g.mu.Unlock()
		return fmt.Errorf("git commit: %w", err)
	}

	// Push
	if err := g.runGit("push", "origin", g.pushBranch); err != nil {
		g.mu.Lock()
		g.lastError = fmt.Sprintf("git push failed: %v", err)
		g.mu.Unlock()
		return fmt.Errorf("git push: %w", err)
	}

	g.mu.Lock()
	g.lastPush = time.Now()
	g.lastError = ""
	g.mu.Unlock()

	fmt.Printf("[translate] Successfully pushed translation changes (by %s)\n", username)
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
	if err := g.ensureReady(); err != nil {
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

// hasGitChanges checks if there are uncommitted changes in the translation directory
func (g *GitHubPusher) hasGitChanges() (bool, error) {
	cmd := exec.Command("git", "status", "--porcelain", "--", g.translationDir)
	cmd.Dir = g.repoPath
	output, err := cmd.Output()
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(string(output)) != "", nil
}

// runGit executes a git command in the repo directory
func (g *GitHubPusher) runGit(args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = g.repoPath
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %s", err, string(output))
	}
	return nil
}

func (g *GitHubPusher) ensureReady() error {
	if _, err := exec.LookPath("git"); err != nil {
		return fmt.Errorf("git executable not found in PATH")
	}

	if strings.TrimSpace(g.repoPath) == "" {
		return fmt.Errorf("GIT_REPO_PATH is empty")
	}

	repoInfo, err := os.Stat(g.repoPath)
	if err != nil || !repoInfo.IsDir() {
		return fmt.Errorf("git repo path is invalid: %s", g.repoPath)
	}

	gitPath := filepath.Join(g.repoPath, ".git")
	if _, err := os.Stat(gitPath); err != nil {
		return fmt.Errorf("no .git found under repo path: %s", g.repoPath)
	}

	if strings.TrimSpace(g.translationDir) == "" {
		return fmt.Errorf("TRANSLATION_REL_DIR is empty")
	}

	translationPath := filepath.Join(g.repoPath, g.translationDir)
	info, err := os.Stat(translationPath)
	if err != nil || !info.IsDir() {
		return fmt.Errorf("translation directory not found in repo: %s", translationPath)
	}

	return nil
}
