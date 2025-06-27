# OpenTelemetry Collector Release Notes Comparator

This project generates a static webapp (for GitHub Pages) that allows users to compare release/upgrade notes for opentelemetry-collector and opentelemetry-collector-contrib between versions, filter by component, and see only relevant upgrade notes.

## How it works
- Go code fetches/parses release notes from GitHub.
- Generates static HTML/JS/CSS and JSON data for the frontend.
- Output is placed in `docs/` for GitHub Pages hosting.

## Usage
1. Run `go run ./cmd/generate.go` to generate the static site.
2. Commit and push the `docs/` directory to your repository.
3. Enable GitHub Pages for the `docs/` directory.

## TODO
- Implement release notes fetching/parsing.
- Build frontend UI for version/component selection and filtering.
- Generate static site output.
