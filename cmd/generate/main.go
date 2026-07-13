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
	// (compKey is already normalized to canonical "type/base" form by
	// ParseUpgradeNotes, so the base is simply whatever follows the slash.)
	for projectName, project := range allData {
		for version, versionData := range project {
			filteredVersionData := make(map[string][]string)
			for compKey, notes := range versionData {
				base := compKey
				if idx := strings.Index(compKey, "/"); idx != -1 {
					base = compKey[idx+1:]
				}
				if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(base)), "$") {
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
	// compKey is already normalized to canonical "type/base" form by
	// ParseUpgradeNotes, so release_notes.json and components.json are
	// guaranteed to agree on component identity without re-deriving it here.
	type Component struct {
		Base string `json:"base"`
		Type string `json:"type"`
	}
	componentSet := make(map[string]struct{})
	var components []Component
	for _, project := range allData {
		for _, versionData := range project {
			for compKey := range versionData {
				if compKey == "" || compKey == "(general)" {
					continue
				}
				var ctype, base string
				if idx := strings.Index(compKey, "/"); idx != -1 {
					ctype = compKey[:idx]
					base = compKey[idx+1:]
				} else {
					ctype = "unknown"
					base = compKey
				}

				// Filter out known-bad components
				baseTrimmed := strings.ToLower(strings.TrimSpace(base))
				if strings.HasSuffix(baseTrimmed, ",") ||
					strings.Contains(baseTrimmed, ",") ||
					baseTrimmed == "processor" ||
					baseTrimmed == "connector" ||
					baseTrimmed == "exporter" ||
					strings.HasPrefix(baseTrimmed, "git.repository") {
					fmt.Fprintf(os.Stderr, "Filtered out known-bad component: %q (base: %q)\n", compKey, base)
					continue
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
