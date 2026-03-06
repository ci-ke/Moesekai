package config

import (
	"os"
)

type Config struct {
	RedisURL            string
	BilibiliSessData    string
	BilibiliCookie      string
	Port                string
	MasterDataPath      string
	TranslationPath     string
	GitHubToken         string
	GitHubRepo          string
	GitHubWorkflowFile  string
	GitHubWorkflowRef   string
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
		GitHubToken:         os.Getenv("GITHUB_TOKEN"),
		GitHubRepo:          os.Getenv("GITHUB_REPO"),
		GitHubWorkflowFile:  getEnv("GITHUB_WORKFLOW_FILE", "sync-translations-from-deploy.yml"),
		GitHubWorkflowRef:   getEnv("GITHUB_WORKFLOW_REF", "main"),
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

func isDir(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.IsDir()
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
