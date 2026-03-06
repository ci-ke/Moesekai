package translate

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// Source types for translations
const (
	SourceCN      = "cn"      // Official CN server translation
	SourceHuman   = "human"   // Human proofread translation
	SourcePinned  = "pinned"  // Pinned translation (never auto-overwritten, for JP/CN ID mismatch)
	SourceLLM     = "llm"     // LLM auto-translation
	SourceUnknown = "unknown" // Legacy data
)

// TranslationEntry represents a single translation with source tracking
type TranslationEntry struct {
	Text   string `json:"text"`
	Source string `json:"source"`
}

// TranslationField is a map of JP text -> TranslationEntry
type TranslationField map[string]TranslationEntry

// TranslationCategory is a map of field name -> TranslationField
type TranslationCategory map[string]TranslationField

// CategoryInfo describes a translation category for the API
type CategoryInfo struct {
	Name   string      `json:"name"`
	Fields []FieldInfo `json:"fields"`
}

// FieldInfo describes a translation field with stats
type FieldInfo struct {
	Name         string `json:"name"`
	Total        int    `json:"total"`
	CnCount      int    `json:"cnCount"`
	HumanCount   int    `json:"humanCount"`
	PinnedCount  int    `json:"pinnedCount"`
	LlmCount     int    `json:"llmCount"`
	UnknownCount int    `json:"unknownCount"`
}

// EntryWithKey is a translation entry with its JP key for API responses
type EntryWithKey struct {
	Key    string `json:"key"`
	Text   string `json:"text"`
	Source string `json:"source"`
}

// Store manages translation data files
type Store struct {
	mu   sync.RWMutex
	path string                         // path to translations directory
	data map[string]TranslationCategory // category -> data
}

// Non-story categories supported for proofreading
var SupportedCategories = []string{
	"cards", "events", "music", "gacha", "virtualLive",
	"sticker", "comic", "mysekai", "costumes", "characters", "units",
}

// NewStore creates a new translation store
func NewStore(translationPath string) *Store {
	s := &Store{
		path: translationPath,
		data: make(map[string]TranslationCategory),
	}
	if err := os.MkdirAll(translationPath, 0o755); err != nil {
		fmt.Printf("[translate] Warning: failed to ensure translation directory %s: %v\n", translationPath, err)
	}
	s.LoadAll()
	return s
}

// LoadAll loads all translation categories from disk
func (s *Store) LoadAll() {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, cat := range SupportedCategories {
		data, err := s.loadCategory(cat)
		if err != nil {
			fmt.Printf("[translate] Warning: failed to load %s: %v\n", cat, err)
			continue
		}
		s.data[cat] = data
	}
	fmt.Printf("[translate] Loaded %d categories\n", len(s.data))
}

// loadCategory reads a .full.json file and parses it
func (s *Store) loadCategory(category string) (TranslationCategory, error) {
	fullPath := filepath.Join(s.path, category+".full.json")
	data, err := os.ReadFile(fullPath)
	if err != nil {
		// Try flat .json as fallback
		flatPath := filepath.Join(s.path, category+".json")
		data, err = os.ReadFile(flatPath)
		if err != nil {
			return nil, fmt.Errorf("no translation file found for %s", category)
		}
		return parseFlatJSON(data)
	}
	return parseFullJSON(data)
}

// parseFullJSON parses .full.json format: { field: { jp: { text, source } } }
func parseFullJSON(data []byte) (TranslationCategory, error) {
	var raw map[string]map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}

	result := make(TranslationCategory)
	for field, entries := range raw {
		tf := make(TranslationField)
		for key, val := range entries {
			var entry TranslationEntry
			if err := json.Unmarshal(val, &entry); err != nil {
				// Maybe flat format: just a string
				var text string
				if err2 := json.Unmarshal(val, &text); err2 != nil {
					continue
				}
				entry = TranslationEntry{Text: text, Source: SourceUnknown}
			}
			tf[key] = entry
		}
		result[field] = tf
	}
	return result, nil
}

// parseFlatJSON parses .json format: { field: { jp: cn } }
func parseFlatJSON(data []byte) (TranslationCategory, error) {
	var raw map[string]map[string]string
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}

	result := make(TranslationCategory)
	for field, entries := range raw {
		tf := make(TranslationField)
		for key, val := range entries {
			tf[key] = TranslationEntry{Text: val, Source: SourceUnknown}
		}
		result[field] = tf
	}
	return result, nil
}

// GetCategories returns info about all loaded categories
func (s *Store) GetCategories() []CategoryInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var cats []CategoryInfo
	for _, name := range SupportedCategories {
		cat, ok := s.data[name]
		if !ok {
			continue
		}
		info := CategoryInfo{Name: name}
		for fieldName, field := range cat {
			fi := FieldInfo{Name: fieldName, Total: len(field)}
			for _, entry := range field {
				switch entry.Source {
				case SourceCN:
					fi.CnCount++
				case SourceHuman:
					fi.HumanCount++
				case SourcePinned:
					fi.PinnedCount++
				case SourceLLM:
					fi.LlmCount++
				default:
					fi.UnknownCount++
				}
			}
			info.Fields = append(info.Fields, fi)
		}
		cats = append(cats, info)
	}
	return cats
}

// GetEntries returns translation entries for a category+field, optionally filtered by source
func (s *Store) GetEntries(category, field, sourceFilter string) []EntryWithKey {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cat, ok := s.data[category]
	if !ok {
		return nil
	}
	tf, ok := cat[field]
	if !ok {
		return nil
	}

	var entries []EntryWithKey
	for key, entry := range tf {
		if sourceFilter != "" && entry.Source != sourceFilter {
			continue
		}
		entries = append(entries, EntryWithKey{
			Key:    key,
			Text:   entry.Text,
			Source: entry.Source,
		})
	}
	return entries
}

// UpdateEntry updates a single translation entry and persists to disk.
// Returns updated=false when input matches existing value and no write occurred.
func (s *Store) UpdateEntry(category, field, key, text, source string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cat, ok := s.data[category]
	if !ok {
		return false, fmt.Errorf("category %s not found", category)
	}
	catCopy := cloneCategory(cat)

	tf, ok := catCopy[field]
	if !ok {
		return false, fmt.Errorf("field %s not found in category %s", field, category)
	}

	newEntry := TranslationEntry{Text: text, Source: source}
	if oldEntry, exists := tf[key]; exists && oldEntry == newEntry {
		return false, nil
	}

	tf[key] = newEntry
	catCopy[field] = tf

	if err := s.saveCategorySnapshot(category, catCopy); err != nil {
		return false, err
	}

	s.data[category] = catCopy

	return true, nil
}

func cloneCategory(cat TranslationCategory) TranslationCategory {
	catCopy := make(TranslationCategory, len(cat))
	for field, entries := range cat {
		fieldCopy := make(TranslationField, len(entries))
		for key, entry := range entries {
			fieldCopy[key] = entry
		}
		catCopy[field] = fieldCopy
	}
	return catCopy
}

// saveCategorySnapshot writes a category snapshot to both .full.json and .json files.
func (s *Store) saveCategorySnapshot(category string, cat TranslationCategory) error {
	if err := os.MkdirAll(s.path, 0o755); err != nil {
		return fmt.Errorf("ensure translation directory: %w", err)
	}

	// Save .full.json (with source tracking)
	fullPath := filepath.Join(s.path, category+".full.json")
	fullData, err := json.MarshalIndent(cat, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal full json: %w", err)
	}
	if err := writeFileAtomic(fullPath, fullData); err != nil {
		return fmt.Errorf("write full json: %w", err)
	}

	// Save .json (flat format for frontend)
	flatPath := filepath.Join(s.path, category+".json")
	flat := make(map[string]map[string]string)
	for field, entries := range cat {
		flat[field] = make(map[string]string)
		for key, entry := range entries {
			flat[field][key] = entry.Text
		}
	}
	flatData, err := json.MarshalIndent(flat, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal flat json: %w", err)
	}
	if err := writeFileAtomic(flatPath, flatData); err != nil {
		return fmt.Errorf("write flat json: %w", err)
	}

	return nil
}

func writeFileAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	base := filepath.Base(path)

	tmpFile, err := os.CreateTemp(dir, base+".tmp-*")
	if err != nil {
		return err
	}
	tmpPath := tmpFile.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return err
	}
	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		return err
	}
	if err := tmpFile.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpPath, 0o644); err != nil {
		return err
	}

	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(path)
		if err2 := os.Rename(tmpPath, path); err2 != nil {
			return err2
		}
	}

	cleanup = false
	return nil
}

// GetTranslationPath returns the path to the translations directory
func (s *Store) GetTranslationPath() string {
	return s.path
}

// HasChanges checks if there are uncommitted changes in the translation directory
func (s *Store) HasChanges() bool {
	// Simple check: compare modified times or use git status
	// For now, just return true - the GitHub push handler will check git status
	return true
}

// isValidCategory checks if a category is supported
func isValidCategory(category string) bool {
	for _, c := range SupportedCategories {
		if c == category {
			return true
		}
	}
	return false
}

// isValidSource checks if a source type is valid
func isValidSource(source string) bool {
	switch source {
	case SourceCN, SourceHuman, SourcePinned, SourceLLM, SourceUnknown:
		return true
	}
	return false
}

// CategoryNamesString returns a comma-separated list of supported categories
func CategoryNamesString() string {
	return strings.Join(SupportedCategories, ", ")
}
