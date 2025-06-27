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

## Local Development

To preview the static website locally:

1. **Generate the static site:

   ```console
   go run ./cmd/generate.go
   go run ./cmd/serve.go
   ```

## GitHub Pages Setup

This project is ready to deploy as a static site using GitHub Pages.

### Steps

1. **Enable GitHub Pages**  
   Go to your repository’s Settings → Pages.  
   Set the source branch to `main` (or your default branch) and the folder to `/docs`.

2. **Automatic Updates**  
   A GitHub Actions workflow (`.github/workflows/generate-release-notes.yml`) is included.  
   It will:
   - Re-generate the static site every Monday at 03:00 UTC (or on manual dispatch).
   - Deploy the updated site to GitHub Pages automatically.

3. **Manual Generation (optional)**  
   You can still run locally:
   ```sh
   go run ./cmd/generate.go
   go run ./cmd/serve.go
   ```
