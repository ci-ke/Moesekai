package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	RedisURL            string
	BilibiliSessData    string
	BilibiliCookie      string
	Port                string
	MasterDataPath      string
	TranslationPath     string
	GitRepoPath         string
	TranslationRelDir   string
	GitPushBranch       string
	TranslationAutoPush bool
	TranslatorAccounts  string
	JWTSecret           string
}

func Load() *Config {
	cfg := &Config{
		RedisURL:            getEnv("REDIS_URL", "localhost:6379"),
		BilibiliSessData:    os.Getenv("BILIBILI_SESSDATA"),
		BilibiliCookie:      os.Getenv("BILIBILI_COOKIE"),
		Port:                getEnv("PORT", "8080"),
		MasterDataPath:      getEnv("MASTER_DATA_PATH", "./data/master"),
		TranslationPath:     resolveTranslationPath(),
		GitRepoPath:         resolveGitRepoPath(),
		TranslationRelDir:   getEnv("TRANSLATION_REL_DIR", "web/public/data/translations"),
		GitPushBranch:       getEnv("GIT_PUSH_BRANCH", "main"),
		TranslationAutoPush: getEnvBool("TRANSLATION_AUTO_PUSH_ENABLED", false),
		TranslatorAccounts:  os.Getenv("TRANSLATOR_ACCOUNTS"),
		JWTSecret:           getEnv("JWT_SECRET", "snowy-translate-secret"),
	}
	return cfg
}

func resolveTranslationPath() string {
	if v := os.Getenv("TRANSLATION_PATH"); v != "" {
		return v
	}

	candidates := []string{
		"./web/public/data/translations",
		"./nextjs/web/public/data/translations",
		"/app/nextjs/web/public/data/translations",
	}

	for _, candidate := range candidates {
		if isDir(candidate) {
			return candidate
		}
	}

	return candidates[0]
}

func resolveGitRepoPath() string {
	if v := os.Getenv("GIT_REPO_PATH"); v != "" {
		return v
	}

	candidates := []string{".", "/repo"}
	for _, candidate := range candidates {
		if pathExists(filepath.Join(candidate, ".git")) {
			return candidate
		}
	}

	return "."
}

func isDir(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.IsDir()
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func getEnv(key, defaultValue string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return defaultValue
	}

	switch v {
	case "1", "true", "TRUE", "True", "yes", "YES", "on", "ON":
		return true
	case "0", "false", "FALSE", "False", "no", "NO", "off", "OFF":
		return false
	default:
		return defaultValue
	}
}
