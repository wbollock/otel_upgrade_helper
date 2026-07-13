package releasenotes

import "strings"

// componentSuffixes are the pipeline component type suffixes that a bare,
// slash-less legacy component name (e.g. "lokiexporter") may end in.
var componentSuffixes = []string{"exporter", "receiver", "processor", "extension", "connector"}

// splitAndTrim splits a string by sep and trims whitespace from each part.
func splitAndTrim(s, sep string) []string {
	parts := []string{}
	for _, p := range strings.Split(s, sep) {
		parts = append(parts, strings.TrimSpace(p))
	}
	return parts
}

// inferBaseAndType extracts a component's base name and type from a raw
// changelog key. Upstream now labels every changelog entry with its own
// directory path (e.g. "receiver/mongodb", "cmd/opampsupervisor"), so any
// "prefix/name" key is trusted directly rather than checked against a fixed
// allowlist of pipeline types. Legacy keys with no slash (e.g. a bare
// "mongodbreceiver") fall back to suffix stripping to recover the type.
func inferBaseAndType(raw string) (base, ctype string) {
	parts := make([]string, 0)
	for _, p := range splitAndTrim(raw, "/") {
		if p != "" {
			parts = append(parts, p)
		}
	}
	switch {
	case len(parts) == 1:
		base = parts[0]
	case len(parts) > 1:
		ctype = strings.ToLower(parts[0])
		base = parts[1] // e.g. receiver/loki/prod -> base: loki
	}
	base = strings.TrimSpace(base)
	// Strip a redundant trailing type suffix from the base (e.g. base
	// "mongodbreceiver" -> "mongodb"), whether or not a type prefix was
	// already found; only fill in ctype from the suffix if it's still unset.
	lower := strings.ToLower(base)
	for _, suf := range componentSuffixes {
		if len(lower) > len(suf) && strings.HasSuffix(lower, suf) {
			if ctype == "" {
				ctype = suf
			}
			base = base[:len(base)-len(suf)]
			break
		}
	}
	return strings.ToLower(strings.TrimSpace(base)), ctype
}

// isBareWord reports whether s is a single lowercase alphanumeric token
// (like "service", "confmap", "mdatagen", "otlp").
func isBareWord(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') {
			return false
		}
	}
	return true
}

// IsComponentLabel reports whether a backticked changelog label plausibly
// names a component, as opposed to something else in backticks that chloggen
// flattened to a top-level bullet (metric names, config options, feature
// gates — e.g. "- `otelcol_exporter_prometheusremotewrite_wal_reads`: ...").
// Accepted shapes:
//   - a directory-style path ("receiver/mongodb", "cmd/opampsupervisor",
//     "pkg/ottl") — the standardized label format,
//   - a legacy bare name ending in a component-type suffix ("lokiexporter"),
//   - a plain lowercase word ("all", "service", "confmap", "zpages").
func IsComponentLabel(raw string) bool {
	label := strings.TrimSpace(correctComponentName(raw))
	if label == "" {
		return false
	}
	if strings.Contains(label, "/") {
		return true
	}
	lower := strings.ToLower(label)
	for _, suf := range componentSuffixes {
		if len(lower) > len(suf) && strings.HasSuffix(lower, suf) {
			return true
		}
	}
	return isBareWord(lower)
}

// NormalizeComponent returns the canonical "type/base" form of a raw
// changelog component key, so that entries logged inconsistently upstream
// (e.g. "lokiexporter" and "exporter/loki") collapse to the same key
// ("exporter/loki"), while distinct namespaces like "cmd/opampsupervisor"
// are preserved as-is. Keys with no discoverable type (e.g. "all") are
// returned as their lowercased base name; "(general)" and "" pass through
// unchanged.
func NormalizeComponent(raw string) string {
	if raw == "" || raw == "(general)" {
		return raw
	}
	base, ctype := inferBaseAndType(correctComponentName(raw))
	if base == "" {
		return strings.ToLower(strings.TrimSpace(raw))
	}
	if ctype == "" {
		return base
	}
	return ctype + "/" + base
}
