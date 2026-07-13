package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/google/go-github/v50/github"
	"golang.org/x/oauth2"

	releasenotes "github.com/wbollock/otel-upgrade-helper/internal/releasenotes"
)

// badComponent reports whether a canonical "type/base" component key is a
// known-bad parse artifact that should be excluded from the site.
func badComponent(compKey string) bool {
	base := compKey
	if idx := strings.Index(compKey, "/"); idx != -1 {
		base = compKey[idx+1:]
	}
	base = strings.ToLower(strings.TrimSpace(base))
	return strings.HasPrefix(base, "$") ||
		strings.Contains(base, ",") ||
		base == "processor" ||
		base == "connector" ||
		base == "exporter" ||
		strings.HasPrefix(base, "git.repository")
}

func main() {
	fmt.Println("OpenTelemetry Collector Release Notes Comparator Static Site Generator")

	ctx := context.Background()
	client := github.NewClient(nil)
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token})
		client = github.NewClient(oauth2.NewClient(ctx, ts))
	}

	projects := []struct {
		Name  string
		Repo  string
		Owner string
	}{
		{"otelcol", "opentelemetry-collector", "open-telemetry"},
		{"otelcol-contrib", "opentelemetry-collector-contrib", "open-telemetry"},
	}

	allData := make(releasenotes.ReleaseNotesData)
	for _, p := range projects {
		releases, err := releasenotes.FetchReleases(ctx, client, p.Owner, p.Repo)
		if err != nil {
			// Failing hard beats deploying a silently emptier site (e.g. on
			// a bad token or rate limiting).
			fmt.Fprintf(os.Stderr, "Error fetching releases for %s: %v\n", p.Name, err)
			os.Exit(1)
		}
		if len(releases) == 0 {
			fmt.Fprintf(os.Stderr, "No releases returned for %s; refusing to generate an empty site\n", p.Name)
			os.Exit(1)
		}
		fmt.Printf("Fetched %d releases for %s\n", len(releases), p.Name)
		allData[p.Name] = make(map[string]releasenotes.VersionNotes)
		for version, rel := range releases {
			parsed := releasenotes.ParseUpgradeNotes(rel.Body)
			components := make(map[string][]releasenotes.Note, len(parsed))
			for compKey, notes := range parsed {
				if compKey != "(general)" && compKey != "" && badComponent(compKey) {
					fmt.Fprintf(os.Stderr, "Filtered out known-bad component: %q\n", compKey)
					continue
				}
				components[compKey] = notes
			}
			allData[p.Name][version] = releasenotes.VersionNotes{
				Date:       rel.Date,
				Components: components,
			}
		}
	}

	os.MkdirAll("docs/data", 0755)
	f, err := os.Create("docs/data/release_notes.json")
	if err != nil {
		panic(err)
	}
	defer f.Close()

	wrapper := releasenotes.ReleaseNotesWrapper{
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		SchemaVersion: 2,
		Data:          allData,
	}

	if err := json.NewEncoder(f).Encode(wrapper); err != nil {
		panic(err)
	}
	fmt.Println("Generated docs/data/release_notes.json")

	// --- Generate components.json from release notes data ---
	// Component keys are already normalized to canonical "type/base" form by
	// ParseUpgradeNotes and filtered above, so release_notes.json and
	// components.json are guaranteed to agree on component identity.
	type Component struct {
		Base string `json:"base"`
		Type string `json:"type"`
	}
	componentSet := make(map[string]struct{})
	var components []Component
	for _, project := range allData {
		for _, versionData := range project {
			for compKey := range versionData.Components {
				if compKey == "" || compKey == "(general)" {
					continue
				}
				ctype, base := "unknown", compKey
				if idx := strings.Index(compKey, "/"); idx != -1 {
					ctype = compKey[:idx]
					base = compKey[idx+1:]
				}
				key := base + ":" + ctype
				if _, exists := componentSet[key]; !exists {
					components = append(components, Component{Base: base, Type: ctype})
					componentSet[key] = struct{}{}
				}
			}
		}
	}
	cf, err := os.Create("docs/data/components.json")
	if err != nil {
		panic(err)
	}
	defer cf.Close()
	if err := json.NewEncoder(cf).Encode(components); err != nil {
		panic(err)
	}
	fmt.Println("Generated docs/data/components.json")
}
