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
		releases, err := releasenotes.FetchReleaseNotes(ctx, client, p.Owner, p.Repo)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error fetching releases for %s: %v\n", p.Name, err)
			continue
		}
		if allData[p.Name] == nil {
			allData[p.Name] = make(map[string]map[string][]string)
		}
		for version, body := range releases {
			parsed := releasenotes.ParseUpgradeNotes(body)
			allData[p.Name][version] = parsed
		}
	}

	// --- Filter out $-prefixed components from release notes data ---
	for projectName, project := range allData {
		for version, versionData := range project {
			filteredVersionData := make(map[string][]string)
			for compKey, notes := range versionData {
				// Split on '/'; get base
				parts := splitAndTrim(compKey, "/")
				base := ""
				if len(parts) > 1 {
					base = parts[1]
				} else if len(parts) == 1 {
					base = parts[0]
				}
				baseTrimmed := strings.ToLower(strings.TrimSpace(base))
				if !strings.HasPrefix(baseTrimmed, "$") {
					filteredVersionData[compKey] = notes
				} else {
					fmt.Fprintf(os.Stderr, "Filtered out release notes for component with base starting with $: %q\n", compKey)
				}
			}
			allData[projectName][version] = filteredVersionData
		}
	}

	os.MkdirAll("docs/data", 0755)
	f, err := os.Create("docs/data/release_notes.json")
	if err != nil {
		panic(err)
	}
	defer f.Close()

	wrapper := releasenotes.ReleaseNotesWrapper{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Data:        allData,
	}

	json.NewEncoder(f).Encode(wrapper)
	fmt.Println("Generated docs/data/release_notes.json")

	// --- Generate components.json from release notes data ---
	type Component struct {
		Base string `json:"base"`
		Type string `json:"type"`
	}
	componentSet := make(map[string]struct{})
	var components []Component
	knownTypes := map[string]bool{"exporter": true, "receiver": true, "processor": true, "extension": true, "connector": true}
	stripSuffixes := []string{"exporter", "receiver", "processor", "extension", "connector"}
	for _, project := range allData {
		for _, versionData := range project {
			for compKey := range versionData {
				if compKey == "" || compKey == "(general)" {
					continue
				}
				// Split on '/'
				parts := make([]string, 0)
				for _, p := range splitAndTrim(compKey, "/") {
					if p != "" {
						parts = append(parts, p)
					}
				}
				var ctype, base string
				if len(parts) > 1 && knownTypes[parts[0]] {
					ctype = parts[0]
					// If second part is like lokiexporter, strip exporter suffix
					base = parts[1]
					for _, suf := range stripSuffixes {
						if len(base) > len(suf) && base[len(base)-len(suf):] == suf {
							base = base[:len(base)-len(suf)]
						}
					}
				} else if len(parts) > 2 && knownTypes[parts[0]] {
					ctype = parts[0]
					base = parts[1] // e.g. receiver/loki/prod -> base: loki
				} else if len(parts) == 1 {
					// Try to infer type from suffix
					base = parts[0]
					ctype = "unknown"
					for _, suf := range stripSuffixes {
						if len(base) > len(suf) && base[len(base)-len(suf):] == suf {
							ctype = suf
							base = base[:len(base)-len(suf)]
						}
					}
				}
				if base == "" {
					base = compKey
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

	// Remove any components that start with a '$' (after trimming whitespace and lowercasing) before writing to JSON
	filteredComponents := make([]Component, 0, len(components))
	for _, c := range components {
		baseTrimmed := strings.ToLower(strings.TrimSpace(c.Base))
		if !strings.HasPrefix(baseTrimmed, "$") {
			filteredComponents = append(filteredComponents, c)
		} else {
			fmt.Fprintf(os.Stderr, "Filtered out component with base starting with $: %q\n", c.Base)
		}
	}
	json.NewEncoder(cf).Encode(filteredComponents)
	fmt.Println("Generated docs/data/components.json from release notes (filtered $ components, trimmed, lowercased check)")
}

// splitAndTrim splits a string by sep and trims whitespace from each part
func splitAndTrim(s, sep string) []string {
	parts := []string{}
	for _, p := range strings.Split(s, sep) {
		parts = append(parts, strings.TrimSpace(p))
	}
	return parts
}
