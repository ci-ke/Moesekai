package main

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"snowy_viewer/internal/bilibili"
	"snowy_viewer/internal/cache"
	"snowy_viewer/internal/config"
	"snowy_viewer/internal/handlers"
	"snowy_viewer/internal/masterdata"
	"snowy_viewer/internal/middleware"
	"snowy_viewer/internal/translate"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize cache (Redis with memory fallback)
	appCache := cache.New(cfg.RedisURL)
	defer appCache.Close()

	// Initialize Bilibili client
	biliClient := bilibili.NewClient(appCache, cfg.BilibiliSessData, cfg.BilibiliCookie)

	// Initialize and load master data
	store := masterdata.NewStore(cfg.MasterDataPath)
	if err := store.Fetch(); err != nil {
		fmt.Printf("Initial fetch error: %v\n", err)
	}

	// Create router and register handlers
	mux := http.NewServeMux()
	handler := handlers.New(store, biliClient)
	handler.RegisterRoutes(mux)

	// Initialize translation proofreading system
	if cfg.TranslatorAccounts != "" {
		translateStore := translate.NewStore(cfg.TranslationPath)
		translateAuth := translate.NewAuth(cfg.TranslatorAccounts, cfg.JWTSecret)
		translatePusher := translate.NewGitHubPusher(
			cfg.GitHubToken,
			cfg.GitHubRepo,
			cfg.GitHubWorkflowFile,
			cfg.GitHubWorkflowRef,
		)

		translateHandler := translate.NewHandler(translateStore, translateAuth, translatePusher)
		translateHandler.RegisterRoutes(mux)

		if cfg.TranslationAutoPush {
			// Start scheduled push (every 1 hour)
			translatePusher.StartScheduledPush(1 * time.Hour)
		} else {
			fmt.Println("Translation auto push disabled (TRANSLATION_AUTO_PUSH_ENABLED=false)")
		}

		fmt.Println("Translation proofreading system initialized")
	} else {
		fmt.Println("Translation proofreading system disabled (no TRANSLATOR_ACCOUNTS set)")
	}

	// Reverse proxy to Next.js standalone server for frontend
	nextjsURL, _ := url.Parse("http://localhost:3000")
	nextjsProxy := httputil.NewSingleHostReverseProxy(nextjsURL)
	nextjsProxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		fmt.Printf("Next.js proxy error for %s: %v\n", r.URL.Path, err)
		http.Error(w, "frontend upstream unavailable", http.StatusBadGateway)
	}

	// Prevent unknown /api/* paths from bouncing between Go and Next.js.
	// Keep Next.js-owned API routes available via explicit allow-list.
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/image-proxy") {
			nextjsProxy.ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	})

	fmt.Println("Proxying frontend requests to Next.js standalone server on :3000")
	mux.Handle("/", nextjsProxy)

	// Apply middlewares and start server
	finalHandler := middleware.Chain(mux, middleware.CORS, middleware.Gzip)

	fmt.Printf("Server starting on :%s...\n", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, finalHandler); err != nil {
		fmt.Printf("Error starting server: %s\n", err)
	}
}
