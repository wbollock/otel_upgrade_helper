package releasenotes

import (
	"context"
	"strings"

	"github.com/google/go-github/v50/github"
)

// FetchReleases fetches releases for a given repo (e.g., "open-telemetry/opentelemetry-collector").
// Returns a map of version -> release, walking every page of releases — the
// API defaults to a single page of 30, which silently capped the site at the
// ~30 most recent versions.
func FetchReleases(ctx context.Context, client *github.Client, owner, repo string) (map[string]Release, error) {
	releases := make(map[string]Release)
	opts := &github.ListOptions{PerPage: 100}
	for {
		page, resp, err := client.Repositories.ListReleases(ctx, owner, repo, opts)
		if err != nil {
			return nil, err
		}
		for _, rel := range page {
			if rel.TagName == nil || rel.Body == nil {
				continue
			}
			r := Release{Body: *rel.Body}
			if rel.PublishedAt != nil {
				r.Date = rel.PublishedAt.Format("2006-01-02")
			}
			releases[*rel.TagName] = r
		}
		if resp.NextPage == 0 {
			break
		}
		opts.Page = resp.NextPage
	}
	return releases, nil
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

// classifySection maps a changelog section heading to a note type. Headings
// that aren't a recognized change-type section (e.g. "## End User Changelog",
// "## Unmaintained Components") reset the type to "".
func classifySection(heading string) string {
	h := strings.ToLower(heading)
	switch {
	case strings.Contains(h, "breaking"):
		return "breaking"
	case strings.Contains(h, "deprecat"):
		return "deprecation"
	case strings.Contains(h, "new component"):
		return "new_component"
	case strings.Contains(h, "enhancement"):
		return "enhancement"
	case strings.Contains(h, "bug fix"), strings.Contains(h, "bugfix"):
		return "bug_fix"
	case strings.Contains(h, "known bug"), strings.Contains(h, "known issue"):
		return "known_issue"
	default:
		return ""
	}
}

// ParseUpgradeNotes parses the release body and extracts upgrade notes by
// component. The change type (breaking/deprecation/enhancement/bug fix/…) is
// taken from the markdown section each bullet appears under rather than
// guessed from keywords in the note text. Indentation decides nesting: only
// unindented "- `...`" lines start a new component entry; indented lines stay
// attached to the entry they're nested under, as sub-bullet children or text
// continuations.
func ParseUpgradeNotes(releaseBody string) map[string][]Note {
	result := make(map[string][]Note)
	var currentComponent string
	var currentType string
	var collecting bool

	appendChildOrContinuation := func(sub string) {
		notes := result[currentComponent]
		if len(notes) == 0 {
			return
		}
		last := &notes[len(notes)-1]
		switch {
		case strings.HasPrefix(sub, "- "):
			last.Children = append(last.Children, strings.TrimSpace(strings.TrimPrefix(sub, "- ")))
		case len(last.Children) > 0:
			last.Children[len(last.Children)-1] += " " + sub
		default:
			last.Text += " " + sub
		}
	}

	for _, line := range strings.Split(releaseBody, "\n") {
		line = strings.TrimRight(line, "\r\n")
		trimmed := strings.TrimSpace(line)
		indented := len(line) > 0 && (line[0] == ' ' || line[0] == '\t')

		// Section headings set the change type for the bullets that follow.
		if !indented && strings.HasPrefix(trimmed, "#") {
			currentType = classifySection(trimmed)
			collecting = false
			continue
		}

		// Unindented "- `component`: note" starts a new entry — but only if
		// the backticked label plausibly names a component. chloggen flattens
		// multi-line notes so that sub-bullets land at column 0, meaning
		// lines like "- `otelcol_..._wal_reads`: The total number of WAL
		// reads." are indistinguishable by indentation from real entries;
		// label shape is the tell. Rejected labels fall through and attach
		// to the entry above them.
		if !indented && strings.HasPrefix(trimmed, "- `") {
			endIdx := strings.Index(trimmed[3:], "`")
			if endIdx > 0 && IsComponentLabel(trimmed[3:3+endIdx]) {
				currentComponent = NormalizeComponent(trimmed[3 : 3+endIdx])
				text := strings.TrimSpace(trimmed[3+endIdx+1:])
				text = strings.TrimSpace(strings.TrimPrefix(text, ":"))
				if text != "" {
					result[currentComponent] = append(result[currentComponent], Note{Text: text, Type: currentType})
					collecting = true
				}
				continue
			}
			if collecting {
				appendChildOrContinuation(trimmed)
				continue
			}
		}

		// Indented lines belong to whatever entry they're nested under, no
		// matter what their own content looks like (e.g. a sub-bullet that
		// itself reads "- `metric_name`: ..." must not become a component).
		if indented {
			if collecting && trimmed != "" {
				appendChildOrContinuation(trimmed)
			}
			continue
		}

		// Unindented top-level bullets without a component label are general
		// notes; they can carry nested children too.
		if strings.HasPrefix(trimmed, "- ") {
			note := strings.TrimSpace(strings.TrimPrefix(trimmed, "- "))
			if note != "" {
				currentComponent = "(general)"
				result[currentComponent] = append(result[currentComponent], Note{Text: note, Type: currentType})
				collecting = true
			}
			continue
		}

		collecting = false
	}
	return result
}
