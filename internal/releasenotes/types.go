package releasenotes

// Note is a single changelog entry for a component, carrying the change
// type derived from the section heading it appeared under and any nested
// sub-bullets (e.g. individual metric names introduced by the change).
type Note struct {
	Text     string   `json:"text"`
	Type     string   `json:"type,omitempty"` // breaking | deprecation | new_component | enhancement | bug_fix | known_issue | ""
	Children []string `json:"children,omitempty"`
}

// Release is one fetched GitHub release.
type Release struct {
	Body string
	Date string // YYYY-MM-DD publication date
}

// VersionNotes holds everything shown for one version of one project.
type VersionNotes struct {
	Date       string            `json:"date,omitempty"`
	Components map[string][]Note `json:"components"`
}

// ReleaseNotesData is the structure exported as JSON for the frontend.
// Example: { "otelcol": { "v0.99.0": { "date": "...", "components": { "exporter/loki": [ {...} ] } } } }
type ReleaseNotesData map[string]map[string]VersionNotes

// ReleaseNotesWrapper wraps the release notes data with metadata
type ReleaseNotesWrapper struct {
	GeneratedAt   string           `json:"generatedAt"`
	SchemaVersion int              `json:"schemaVersion"`
	Data          ReleaseNotesData `json:"data"`
}
