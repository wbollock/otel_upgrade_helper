package releasenotes

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/go-github/v50/github"
)

// FetchReleaseNotes fetches release notes for a given repo (e.g., "open-telemetry/opentelemetry-collector")
// Returns a map of version -> release body
func FetchReleaseNotes(ctx context.Context, client *github.Client, owner, repo string) (map[string]string, error) {
	notes := make(map[string]string)
	releases, _, err := client.Repositories.ListReleases(ctx, owner, repo, nil)
	if err != nil {
		return nil, err
	}
	for _, rel := range releases {
		if rel.TagName != nil && rel.Body != nil {
			// Log the tag and first 300 chars of the body for debugging
			fmt.Printf("\n==== %s ===\n%s\n", *rel.TagName, (*rel.Body)[:min(300, len(*rel.Body))])
			notes[*rel.TagName] = *rel.Body
		}
	}
	return notes, nil
}

// correctComponentName attempts to fix common typos in component names
func correctComponentName(name string) string {
	typoMap := map[string]string{
		"reciver":    "receiver",
		"exproter":   "exporter",
		"procesor":   "processor",
		"proccessor": "processor",
		"proccesser": "processor",
		"proccess":   "process",
		"reciever":   "receiver",
		"recivers":   "receivers",
		"exporer":    "exporter",
		"expoter":    "exporter",
		"extention":  "extension",
		// Add more as needed
	}
	for typo, fix := range typoMap {
		name = strings.ReplaceAll(name, typo, fix)
	}
	return name
}

// ParseUpgradeNotes parses the release body and extracts upgrade notes by component
// Returns a map of component -> []notes
func ParseUpgradeNotes(releaseBody string) map[string][]string {
	result := make(map[string][]string)
	var currentComponent string
	var collecting bool
	for _, line := range strings.Split(releaseBody, "\n") {
		line = strings.TrimRight(line, "\r\n")
		trimmed := strings.TrimSpace(line)
		// Look for lines like: - `component/name`: ...
		if strings.HasPrefix(trimmed, "- `") {
			endIdx := strings.Index(trimmed[3:], "`")
			if endIdx > 0 {
				currentComponent = correctComponentName(trimmed[3 : 3+endIdx])
				note := strings.TrimSpace(trimmed[3+endIdx+1:])
				if strings.HasPrefix(note, ":") {
					note = strings.TrimSpace(note[1:])
				}
				note = highlightEmojis(note)
				if note != "" {
					result[currentComponent] = append(result[currentComponent], note)
				}
				collecting = true
				continue
			}
		}
		// If we hit another component, stop collecting for previous
		if strings.HasPrefix(trimmed, "- `") {
			collecting = false
		}
		// Collect indented sub-bullets as part of the current component
		if collecting && (strings.HasPrefix(line, "    ") || strings.HasPrefix(line, "\t") || (len(line) > 0 && line[0] == ' ')) {
			subNote := strings.TrimSpace(line)
			subNote = highlightEmojis(subNote)
			if subNote != "" {
				result[currentComponent] = append(result[currentComponent], subNote)
			}
			continue
		}
		// Also collect top-level breaking changes and bugfixes (not tied to a component)
		if strings.HasPrefix(trimmed, "- ") && !strings.HasPrefix(trimmed, "- `") {
			note := strings.TrimPrefix(trimmed, "- ")
			note = highlightEmojis(note)
			if note != "" {
				result["(general)"] = append(result["(general)"], note)
			}
		}
	}
	return result
}

// highlightEmojis adds emojis for breaking changes and bugfixes
func highlightEmojis(note string) string {
	lower := strings.ToLower(note)
	if strings.Contains(lower, "breaking") {
		note = "🚨⚠️ " + note
	}
	if strings.Contains(lower, "bug") || strings.Contains(lower, "fix") {
		note = "🐞 " + note
	}
	return note
}

// min returns the smaller of two ints
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
