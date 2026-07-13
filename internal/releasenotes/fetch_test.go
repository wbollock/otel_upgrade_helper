package releasenotes

import (
	"reflect"
	"testing"
)

func TestNormalizeComponent(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		// standardized "type/name" labels pass through canonically
		{"receiver/mongodb", "receiver/mongodb"},
		{"exporter/doris", "exporter/doris"},
		{"connector/routing", "connector/routing"},
		// legacy bare names with type suffix
		{"lokiexporter", "exporter/loki"},
		{"datadogreceiver", "receiver/datadog"},
		{"transformprocessor", "processor/transform"},
		// redundant suffix after an explicit prefix collapses
		{"receiver/prometheusreceiver", "receiver/prometheus"},
		// typos are corrected before inference
		{"prometheusreciever", "receiver/prometheus"},
		{"exporter/prometheusremotewriteexproter", "exporter/prometheusremotewrite"},
		// non-pipeline namespaces are preserved
		{"cmd/opampsupervisor", "cmd/opampsupervisor"},
		{"pkg/ottl", "pkg/ottl"},
		{"cmd/mdatagen", "cmd/mdatagen"},
		// no discoverable type
		{"all", "all"},
		{"service", "service"},
		// pass-throughs
		{"(general)", "(general)"},
		{"", ""},
	}
	for _, c := range cases {
		if got := NormalizeComponent(c.in); got != c.want {
			t.Errorf("NormalizeComponent(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestIsComponentLabel(t *testing.T) {
	accept := []string{
		"receiver/mongodb", "exporter/loki", "cmd/opampsupervisor", "pkg/ottl",
		"lokiexporter", "prometheusreciever", "all", "service", "confmap", "mdatagen",
	}
	reject := []string{
		"otelcol_exporter_prometheusremotewrite_wal_reads",
		"exporter.datadogexporter.metricremappingdisabled",
		"host.interface", "event_name", "",
	}
	for _, s := range accept {
		if !IsComponentLabel(s) {
			t.Errorf("IsComponentLabel(%q) = false, want true", s)
		}
	}
	for _, s := range reject {
		if IsComponentLabel(s) {
			t.Errorf("IsComponentLabel(%q) = true, want false", s)
		}
	}
}

// Verbatim shape from the contrib v0.128.0 release: chloggen flattens a
// note's sub-bullets to column 0, so they must be recognized as children by
// label shape, not indentation.
func TestParseFlattenedSubBullets(t *testing.T) {
	body := "## End user changelog\n" +
		"\n" +
		"### 💡 Enhancements 💡\n" +
		"\n" +
		"- `prometheusremotewriteexproter`: Adds wal metrics to the Prometheus Remote Write Exporter. The new metrics are:\n" +
		"- `otelcol_exporter_prometheusremotewrite_wal_reads`: The total number of WAL reads.\n" +
		"- `otelcol_exporter_prometheusremotewrite_wal_reads_failures`: The total number of WAL reads failures.\n" +
		" (#39556)\n" +
		"- `processor/resourcedetection`: add `host.interface` resource attribute to `system` detector (#39419)\n"

	got := ParseUpgradeNotes(body)

	prw, ok := got["exporter/prometheusremotewrite"]
	if !ok || len(prw) != 1 {
		t.Fatalf("expected 1 note for exporter/prometheusremotewrite, got %#v", got)
	}
	if prw[0].Type != "enhancement" {
		t.Errorf("note type = %q, want enhancement", prw[0].Type)
	}
	wantChildren := []string{
		"`otelcol_exporter_prometheusremotewrite_wal_reads`: The total number of WAL reads.",
		"`otelcol_exporter_prometheusremotewrite_wal_reads_failures`: The total number of WAL reads failures. (#39556)",
	}
	if !reflect.DeepEqual(prw[0].Children, wantChildren) {
		t.Errorf("children = %#v, want %#v", prw[0].Children, wantChildren)
	}

	if _, bad := got["otelcol_exporter_prometheusremotewrite_wal_reads"]; bad {
		t.Error("metric name leaked into components")
	}
	if rd, ok := got["processor/resourcedetection"]; !ok || len(rd) != 1 {
		t.Errorf("expected 1 note for processor/resourcedetection, got %#v", got["processor/resourcedetection"])
	}
}

// Verbatim shape from core v0.108.0: mixed legacy and standardized labels
// under typed sections must collapse to the same canonical keys.
func TestParseSectionTypes(t *testing.T) {
	body := "## End User Changelog\n" +
		"\n" +
		"### 🛑 Breaking changes 🛑\n" +
		"\n" +
		"- `all`: Added support for go1.23, bumped the minimum version to 1.22 (#10651)\n" +
		"- `lokiexporter`: Update the scope name for telemetry produced (#10652)\n" +
		"\n" +
		"### 🚩 Deprecations 🚩\n" +
		"\n" +
		"- `exporter/datadog`: The `logs::dump_payloads` config option is deprecated (#10653)\n" +
		"\n" +
		"### 🚀 New components 🚀\n" +
		"\n" +
		"- `exporter/doris`: Add a new component for exporting logs (#10654)\n" +
		"\n" +
		"### 💡 Enhancements 💡\n" +
		"\n" +
		"- `transformprocessor`: Promote feature gate to beta (#10655)\n" +
		"\n" +
		"### 🧰 Bug fixes 🧰\n" +
		"\n" +
		"- `vcenterreceiver`: Several host performance metrics now return correct values (#10656)\n"

	got := ParseUpgradeNotes(body)

	checks := []struct {
		component string
		wantType  string
	}{
		{"all", "breaking"},
		{"exporter/loki", "breaking"},
		{"exporter/datadog", "deprecation"},
		{"exporter/doris", "new_component"},
		{"processor/transform", "enhancement"},
		{"receiver/vcenter", "bug_fix"},
	}
	for _, c := range checks {
		notes := got[c.component]
		if len(notes) != 1 {
			t.Errorf("%s: expected 1 note, got %#v", c.component, notes)
			continue
		}
		if notes[0].Type != c.wantType {
			t.Errorf("%s: type = %q, want %q", c.component, notes[0].Type, c.wantType)
		}
	}
}

// Indented sub-bullets (well-formed markdown nesting) also become children,
// and general top-level bullets get the section type.
func TestParseIndentedChildrenAndGeneral(t *testing.T) {
	body := "### 🛑 Breaking changes 🛑\n" +
		"- `receiver/kafka`: Rename config fields. (#123)\n" +
		"  - `auth.tls` was renamed to `tls`\n" +
		"  - `auth.plain_text` was removed\n" +
		"    continued explanation of the removal\n" +
		"- The binary release adds a new OTLP-only distro (#456)\n"

	got := ParseUpgradeNotes(body)

	kafka := got["receiver/kafka"]
	if len(kafka) != 1 {
		t.Fatalf("expected 1 kafka note, got %#v", kafka)
	}
	wantChildren := []string{
		"`auth.tls` was renamed to `tls`",
		"`auth.plain_text` was removed continued explanation of the removal",
	}
	if !reflect.DeepEqual(kafka[0].Children, wantChildren) {
		t.Errorf("children = %#v, want %#v", kafka[0].Children, wantChildren)
	}

	gen := got["(general)"]
	if len(gen) != 1 || gen[0].Type != "breaking" {
		t.Errorf("general notes = %#v, want one breaking note", gen)
	}
}

// Headings that aren't change-type sections reset the type.
func TestParseTypeResetOnUnknownSection(t *testing.T) {
	body := "### 🧰 Bug fixes 🧰\n" +
		"- `pkg/stanza`: Fix a thing (#1)\n" +
		"## Unmaintained Components\n" +
		"- `receiver/foo`: is unmaintained (#2)\n"

	got := ParseUpgradeNotes(body)
	if typ := got["pkg/stanza"][0].Type; typ != "bug_fix" {
		t.Errorf("pkg/stanza type = %q, want bug_fix", typ)
	}
	if typ := got["receiver/foo"][0].Type; typ != "" {
		t.Errorf("receiver/foo type = %q, want empty", typ)
	}
}
