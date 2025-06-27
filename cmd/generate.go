package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/google/go-github/v50/github"
	"golang.org/x/oauth2"

	releasenotes "github.com/yourusername/otel-upgrade-helper/internal/releasenotes"
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

	os.MkdirAll("docs/data", 0755)
	f, err := os.Create("docs/data/release_notes.json")
	if err != nil {
		panic(err)
	}
	defer f.Close()
	json.NewEncoder(f).Encode(allData)
	fmt.Println("Generated docs/data/release_notes.json")
}
