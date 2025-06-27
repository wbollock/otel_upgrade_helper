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

// ParseUpgradeNotes parses the release body and extracts upgrade notes by component
// Returns a map of component -> []notes
func ParseUpgradeNotes(releaseBody string) map[string][]string {
	result := make(map[string][]string)
	var currentComponent string
	for _, line := range strings.Split(releaseBody, "\n") {
		line = strings.TrimSpace(line)
		// Look for lines like: - `component/name`: ...
		if strings.HasPrefix(line, "- `") {
			endIdx := strings.Index(line[3:], "`")
			if endIdx > 0 {
				currentComponent = line[3 : 3+endIdx]
				note := strings.TrimSpace(line[3+endIdx+1:])
				if note != "" {
					result[currentComponent] = append(result[currentComponent], note)
				}
			}
		}
	}
	return result
}

// min returns the smaller of two ints
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
