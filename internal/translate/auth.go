package translate

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// User represents a translator account
type User struct {
	Username string `json:"username"`
	Password string `json:"-"`
}

// Auth manages authentication for the translation system
type Auth struct {
	users     map[string]User // username -> User
	jwtSecret []byte
}

// JWTClaims represents the JWT payload
type JWTClaims struct {
	Username string `json:"username"`
	Exp      int64  `json:"exp"`
}

// NewAuth creates a new Auth instance from accounts string
// Format: "user1:pass1,user2:pass2"
func NewAuth(accountsStr, jwtSecret string) *Auth {
	a := &Auth{
		users:     make(map[string]User),
		jwtSecret: []byte(jwtSecret),
	}

	if accountsStr == "" {
		return a
	}

	accounts := strings.Split(accountsStr, ",")
	for _, account := range accounts {
		parts := strings.SplitN(strings.TrimSpace(account), ":", 2)
		if len(parts) == 2 {
			username := strings.TrimSpace(parts[0])
			password := strings.TrimSpace(parts[1])
			a.users[username] = User{Username: username, Password: password}
			fmt.Printf("[translate] Registered translator: %s\n", username)
		}
	}

	return a
}

// Authenticate checks username and password
func (a *Auth) Authenticate(username, password string) bool {
	user, ok := a.users[username]
	if !ok {
		return false
	}
	return user.Password == password
}

// GenerateToken creates a JWT token for a user
func (a *Auth) GenerateToken(username string) (string, error) {
	claims := JWTClaims{
		Username: username,
		Exp:      time.Now().Add(7 * 24 * time.Hour).Unix(), // 7 days
	}

	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	// Simple JWT: base64(header).base64(payload).signature
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString(claimsJSON)

	signingInput := header + "." + payload
	mac := hmac.New(sha256.New, a.jwtSecret)
	mac.Write([]byte(signingInput))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return signingInput + "." + signature, nil
}

// ValidateToken validates a JWT token and returns the username
func (a *Auth) ValidateToken(tokenStr string) (string, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return "", fmt.Errorf("invalid token format")
	}

	// Verify signature
	signingInput := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, a.jwtSecret)
	mac.Write([]byte(signingInput))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(parts[2]), []byte(expectedSig)) {
		return "", fmt.Errorf("invalid signature")
	}

	// Decode payload
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("invalid payload encoding")
	}

	var claims JWTClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return "", fmt.Errorf("invalid payload")
	}

	// Check expiration
	if time.Now().Unix() > claims.Exp {
		return "", fmt.Errorf("token expired")
	}

	return claims.Username, nil
}

// AuthMiddleware extracts and validates the token from the Authorization header
func (a *Auth) AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		if !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, `{"error":"invalid authorization format"}`, http.StatusUnauthorized)
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		username, err := a.ValidateToken(token)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusUnauthorized)
			return
		}

		// Add username to request context via header (simple approach)
		r.Header.Set("X-Translator-Username", username)
		next(w, r)
	}
}

// HasUsers returns true if there are any registered translator accounts
func (a *Auth) HasUsers() bool {
	return len(a.users) > 0
}
