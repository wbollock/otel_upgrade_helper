package releasenotes

// ReleaseNote represents a parsed release note entry
// for a specific component and version.
type ReleaseNote struct {
	Project   string   `json:"project"`
	Version   string   `json:"version"`
	Component string   `json:"component"`
	Notes     []string `json:"notes"`
}

// ReleaseNotesData is the structure exported as JSON for the frontend
// Contains all parsed notes for all versions/components
// Example: { "otelcol": { "v0.99.0": { "componentA": ["note1", ...] } } }
type ReleaseNotesData map[string]map[string]map[string][]string
