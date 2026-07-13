// Placeholder for frontend logic
// This will be replaced by Go-generated data and logic

document.addEventListener('DOMContentLoaded', function() {
    // Load release notes data and components list
    Promise.all([
        fetch('data/release_notes.json').then(res => res.json()),
        fetch('data/components.json').then(res => res.json())
    ]).then(([dataRaw, allComponentList]) => {
        // Schema v2: data[project][version] = { date, components: { key: [ {text, type, children} ] } }
        const data = dataRaw.data;
        const versionEntry = (project, ver) => (data[project] && data[project][ver]) || {};
        const versionComponents = (project, ver) => versionEntry(project, ver).components || {};
        // Display generated timestamp
        if (dataRaw.generatedAt) {
            const appDiv = document.getElementById('app');
            const tsDiv = document.createElement('div');
            tsDiv.id = 'generated-timestamp';
            tsDiv.style = 'text-align:center;color:#888;font-size:0.98em;margin-bottom:0.7em;';
            tsDiv.textContent = `Release notes last generated: ${new Date(dataRaw.generatedAt).toLocaleString()}`;
            appDiv.insertBefore(tsDiv, appDiv.children[1]);
        }

        const projectSelect = document.getElementById('project-select');
        const fromVersion = document.getElementById('from-version');
        const toVersion = document.getElementById('to-version');
        const componentList = document.getElementById('component-list');
        const componentCount = document.getElementById('component-count');
        const componentClear = document.getElementById('component-clear');
        const resultsDiv = document.getElementById('results');
        const latestVersionSpan = document.getElementById('latest-version');

        // Versions of a project, ascending (oldest first)
        function sortedVersions(project) {
            return Object.keys(data[project] || {})
                .filter(v => !v.startsWith('cmd/'))
                .sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
        }

        function versionOption(project, v) {
            const d = versionEntry(project, v).date;
            return `<option value="${v}">${v}${d ? ' — ' + d : ''}</option>`;
        }

        function updateVersions() {
            const project = projectSelect.value;
            const versions = sortedVersions(project).reverse();
            fromVersion.innerHTML = versions.map(v => versionOption(project, v)).join('');
            toVersion.innerHTML = versions.map(v => versionOption(project, v)).join('');
            // Start from version about 10 versions back, or first if less
            if (versions.length > 0) {
                fromVersion.value = versions[Math.min(10, versions.length-1)];
                toVersion.value = versions[0];
            }
            updateComponents();
        }

        function updateLatestVersion() {
            const versions = sortedVersions(projectSelect.value);
            latestVersionSpan.textContent = versions.length ? `Latest: ${versions[versions.length - 1]}` : '';
        }

        // --- Component search and multi-select ---
        // Selection lives in a Set of display labels, independent of what the
        // search box currently shows, so searching can never drop selections.
        // An empty selection means "all components".
        const componentSearch = document.getElementById('component-search');
        const selectedSet = new Set();
        let allComponents = [];

        // --- Enhanced component mapping with type ---
        // Component keys in release_notes.json and components.json are both
        // generated from the same canonical "type/base" normalization on the
        // Go side, so they're guaranteed to agree here without any client-side
        // typo-fixing or type-guessing.
        let baseTypeToKeys = {}; // e.g. { 'loki:exporter': ['exporter/loki'] }
        let displayToBaseType = {}; // e.g. { 'loki (exporter)': 'loki:exporter' }
        function getTypeFromKey(key) {
            const idx = key.indexOf('/');
            return idx === -1 ? 'unknown' : key.slice(0, idx);
        }

        function getBaseName(key) {
            const idx = key.indexOf('/');
            return idx === -1 ? key : key.slice(idx + 1);
        }

        function updateComponents() {
            const project = projectSelect.value;
            const from = fromVersion.value;
            const to = toVersion.value;
            let components = new Set();
            [from, to].forEach(ver => {
                Object.keys(versionComponents(project, ver)).forEach(c => components.add(c));
            });
            components.delete("");
            // Build base+type mapping from release notes
            baseTypeToKeys = {};
            Array.from(components).forEach(c => {
                const base = getBaseName(c);
                const type = getTypeFromKey(c);
                const key = `${base}:${type}`;
                if (!baseTypeToKeys[key]) baseTypeToKeys[key] = [];
                baseTypeToKeys[key].push(c);
            });
            // --- Merge in all components from components.json ---
            allComponentList.forEach(entry => {
                const base = entry.base;
                const type = entry.type;
                if (!base || !type || type === 'unknown') return;
                const key = `${base}:${type}`;
                if (!baseTypeToKeys[key]) baseTypeToKeys[key] = [];
                // Add a synthetic key for display if not present
                if (!baseTypeToKeys[key].includes(`${type}/${base}`)) {
                    baseTypeToKeys[key].push(`${type}/${base}`);
                }
            });
            // Build display list, deduplicated
            displayToBaseType = {};
            const seen = new Set();
            const displayList = Object.keys(baseTypeToKeys).map(k => {
                const [base, type] = k.split(':');
                const label = `${base} (${type})`;
                if (seen.has(label)) return null;
                seen.add(label);
                displayToBaseType[label] = k;
                return label;
            }).filter(Boolean).sort();
            allComponents = displayList;
            // Drop selections that no longer exist (e.g. after project switch)
            selectedSet.forEach(label => {
                if (!allComponents.includes(label)) selectedSet.delete(label);
            });
            renderComponentList();
        }

        function renderComponentList() {
            const q = componentSearch.value.trim().toLowerCase();
            const qLoose = q.replace(/[_\-.\s]/g, '');
            const matches = label => {
                if (!q) return true;
                const l = label.toLowerCase();
                return l.includes(q) || l.replace(/[_\-.\s]/g, '').includes(qLoose);
            };
            // Selected components stay visible (pinned first) regardless of
            // the search filter, so a search can never hide what's selected.
            const selected = allComponents.filter(c => selectedSet.has(c));
            const unselected = allComponents.filter(c => !selectedSet.has(c) && matches(c));
            const row = (c, checked) =>
                `<label class="component-option${checked ? ' selected' : ''}"><input type="checkbox" value="${escapeHtml(c)}"${checked ? ' checked' : ''}> ${escapeHtml(c)}</label>`;
            componentList.innerHTML = selected.map(c => row(c, true)).join('') + unselected.map(c => row(c, false)).join('');
            updateComponentCount();
        }

        function updateComponentCount() {
            const n = selectedSet.size;
            componentCount.textContent = n === 0
                ? `All ${allComponents.length} components (select to narrow)`
                : `${n} component${n === 1 ? '' : 's'} selected`;
            componentClear.hidden = n === 0;
        }

        componentSearch.addEventListener('input', renderComponentList);

        componentList.addEventListener('change', e => {
            const box = e.target;
            if (!box || box.type !== 'checkbox') return;
            if (box.checked) selectedSet.add(box.value);
            else selectedSet.delete(box.value);
            box.closest('.component-option').classList.toggle('selected', box.checked);
            // Deliberately no re-render here: reordering under the pointer
            // would make multi-picking miserable. Pinning refreshes on the
            // next search/version change.
            updateComponentCount();
            updateUrlFromUI();
        });

        componentClear.addEventListener('click', () => {
            selectedSet.clear();
            renderComponentList();
            updateUrlFromUI();
        });

        // --- URL state (shareable links) ---
        function getSelectedComponents() {
            return allComponents.filter(c => selectedSet.has(c));
        }
        function setQueryParams(params) {
            const q = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
            history.replaceState(null, '', '?' + q);
        }
        function getQueryParams() {
            const params = {};
            window.location.search.replace(/\??([^=&]+)=([^&]*)/g, function(_, k, v) {
                params[decodeURIComponent(k)] = decodeURIComponent(v);
            });
            return params;
        }

        function updateUrlFromUI() {
            setQueryParams({
                project: projectSelect.value,
                from: fromVersion.value,
                to: toVersion.value,
                // Empty means "all components" — never serialize the full
                // list, which used to blow past URL length limits.
                component: getSelectedComponents().join(',')
            });
        }

        projectSelect.addEventListener('change', () => { updateVersions(); updateLatestVersion(); updateUrlFromUI(); });
        fromVersion.addEventListener('change', () => { updateComponents(); updateUrlFromUI(); });
        toVersion.addEventListener('change', () => { updateComponents(); updateUrlFromUI(); });

        // Initial state: default project, then apply anything from the URL
        projectSelect.value = 'otelcol-contrib';
        const params = getQueryParams();
        if (params.project && data[params.project]) projectSelect.value = params.project;
        updateVersions();
        updateLatestVersion();
        if (params.from) fromVersion.value = params.from;
        if (params.to) toVersion.value = params.to;
        updateComponents();
        if (params.component && params.component !== 'all') {
            params.component.split(',').forEach(label => {
                if (allComponents.includes(label)) selectedSet.add(label);
            });
            renderComponentList();
        }

        // --- Comparison ---
        const resultsToolbar = document.getElementById('results-toolbar');
        const breakingOnly = document.getElementById('breaking-only');
        const copyLinkBtn = document.getElementById('copy-link-btn');
        const copyLinkStatus = document.getElementById('copy-link-status');

        function runComparison() {
            updateUrlFromUI();
            const project = projectSelect.value;
            const selectedDisplays = getSelectedComponents();
            const onlyBreaking = breakingOnly.checked;
            const repo = repoForProject(project);
            const versions = sortedVersions(project);
            const fromIdx = versions.indexOf(fromVersion.value);
            const toIdx = versions.indexOf(toVersion.value);
            if (fromIdx === -1 || toIdx === -1) {
                resultsDiv.innerHTML = '<em>Invalid version selection.</em>';
                return;
            }
            const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
            const selectedVersions = versions.slice(start, end + 1);
            const rangeFrom = versions[start], rangeTo = versions[end];

            const typeCounts = {};
            const blocks = [];
            selectedVersions.forEach(ver => {
                const notesData = versionComponents(project, ver);
                let componentsToShow = [];
                if (selectedDisplays.length === 0) {
                    componentsToShow = Object.keys(notesData);
                } else {
                    selectedDisplays.forEach(display => {
                        const baseType = displayToBaseType[display];
                        if (baseTypeToKeys[baseType]) {
                            baseTypeToKeys[baseType].forEach(k => {
                                if (!componentsToShow.includes(k)) componentsToShow.push(k);
                            });
                        }
                    });
                }
                componentsToShow = componentsToShow.filter(c => c && c !== '').sort();
                let notesHtml = '';
                let hasBreaking = false;
                componentsToShow.forEach(c => {
                    let notesArr = dedupeNotes(notesData[c] || []);
                    if (onlyBreaking) notesArr = notesArr.filter(n => n.type === 'breaking');
                    if (!notesArr.length) return;
                    notesArr.forEach(n => {
                        const t = n.type || 'other';
                        typeCounts[t] = (typeCounts[t] || 0) + 1;
                        if (t === 'breaking') hasBreaking = true;
                    });
                    notesHtml += `<h4 class="component-name">${escapeHtml(c)}${componentSourceLink(repo, ver, c)}</h4>`
                        + `<ul class="notes-list">` + notesArr.map(n => renderNote(n, repo)).join('') + '</ul>';
                });
                if (notesHtml) {
                    const dateStr = versionEntry(project, ver).date;
                    const dateHtml = dateStr ? `<span class="version-date">${escapeHtml(dateStr)}</span>` : '';
                    const releaseUrl = `https://github.com/${repo}/releases/tag/${encodeURIComponent(ver)}`;
                    const releaseLink = ` <a class="release-link" href="${releaseUrl}" target="_blank" rel="noopener noreferrer" title="View the full release notes on GitHub">View full release notes ↗</a>`;
                    // Versions with breaking changes start expanded; the rest
                    // start collapsed unless the range is short.
                    const open = (hasBreaking || selectedVersions.length <= 3) ? ' open' : '';
                    blocks.push(`<details class="release-block"${open}><summary class="version-summary">`
                        + `<span class="version-header">${escapeHtml(ver)}</span> ${dateHtml}${releaseLink}</summary>${notesHtml}</details>`);
                }
            });

            // Summary header: how scary is this upgrade, at a glance
            const summaryBits = [];
            if (typeCounts.breaking) summaryBits.push(`<strong class="summary-breaking">${typeCounts.breaking} breaking</strong>`);
            if (typeCounts.deprecation) summaryBits.push(`${typeCounts.deprecation} deprecation${typeCounts.deprecation === 1 ? '' : 's'}`);
            if (typeCounts.bug_fix) summaryBits.push(`${typeCounts.bug_fix} bug fix${typeCounts.bug_fix === 1 ? '' : 'es'}`);
            if (typeCounts.enhancement) summaryBits.push(`${typeCounts.enhancement} enhancement${typeCounts.enhancement === 1 ? '' : 's'}`);
            if (typeCounts.new_component) summaryBits.push(`${typeCounts.new_component} new component${typeCounts.new_component === 1 ? '' : 's'}`);
            const scope = selectedDisplays.length
                ? `${selectedDisplays.length} selected component${selectedDisplays.length === 1 ? '' : 's'}`
                : 'all components';
            const summary = `<div class="results-summary">${escapeHtml(rangeFrom)} → ${escapeHtml(rangeTo)}: `
                + `${blocks.length} of ${selectedVersions.length} versions have changes for ${scope}`
                + (summaryBits.length ? ` — ${summaryBits.join(', ')}` : '')
                + (onlyBreaking ? ' <em>(breaking only)</em>' : '')
                + `</div>`;

            let body;
            if (blocks.length) {
                body = blocks.join('');
            } else if (onlyBreaking) {
                body = '<em>No breaking changes in this range for your selection 🎉</em>';
            } else if (selectedDisplays.length) {
                body = `<em>No upgrade notes for your selected components between ${escapeHtml(rangeFrom)} and ${escapeHtml(rangeTo)} — should be a quiet upgrade 🎉</em>`;
            } else {
                body = '<em>No upgrade notes found in this range.</em>';
            }
            resultsDiv.innerHTML = summary + body;
            resultsToolbar.hidden = false;
        }

        document.getElementById('compare-btn').addEventListener('click', runComparison);
        breakingOnly.addEventListener('change', () => { if (!resultsToolbar.hidden) runComparison(); });
        copyLinkBtn.addEventListener('click', () => {
            const url = window.location.href;
            const done = () => {
                copyLinkStatus.textContent = 'Copied!';
                setTimeout(() => { copyLinkStatus.textContent = ''; }, 2000);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(done, () => { copyLinkStatus.textContent = url; });
            } else {
                copyLinkStatus.textContent = url;
            }
        });

        // --- Note rendering helpers ---
        function repoForProject(project) {
            return project === 'otelcol' ? 'open-telemetry/opentelemetry-collector' : 'open-telemetry/opentelemetry-collector-contrib';
        }

        function escapeHtml(s) {
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        // Escape first, then apply a safe markdown subset: [text](url) links,
        // `code` spans, and bare #12345 issue/PR references.
        function formatNoteText(text, repo) {
            let out = escapeHtml(text);
            out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
                (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
            out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
            out = out.replace(/(^|[\s(])#(\d{3,7})\b/g,
                (_, pre, num) => `${pre}<a href="https://github.com/${repo}/issues/${num}" target="_blank" rel="noopener noreferrer">#${num}</a>`);
            return out;
        }

        const noteTypeLabels = {
            breaking: 'BREAKING',
            deprecation: 'DEPRECATION',
            new_component: 'NEW',
            enhancement: 'ENHANCEMENT',
            bug_fix: 'BUG FIX',
            known_issue: 'KNOWN ISSUE',
        };

        function renderNote(note, repo) {
            const badge = note.type && noteTypeLabels[note.type]
                ? `<span class="badge badge-${note.type}">${noteTypeLabels[note.type]}</span> ` : '';
            const children = (note.children && note.children.length)
                ? `<ul class="note-children">${note.children.map(ch => `<li>${formatNoteText(ch, repo)}</li>`).join('')}</ul>` : '';
            return `<li class="note note-${note.type || 'other'}">${badge}${formatNoteText(note.text, repo)}${children}</li>`;
        }

        function dedupeNotes(notes) {
            const seen = new Set();
            return notes.filter(n => {
                const key = `${n.type}|${n.text}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }

        // Upstream directories are "<type>/<base><type>" for pipeline
        // components (exporter/loki lives at exporter/lokiexporter); other
        // prefixes (cmd/, pkg/, ...) are literal paths. Link into the tag
        // being read, not main, so removed/renamed components still resolve.
        const pipelineTypes = ['receiver', 'exporter', 'processor', 'extension', 'connector'];
        function componentSourceLink(repo, ver, key) {
            if (key === '(general)' || !key.includes('/')) return '';
            const [type, base] = [key.slice(0, key.indexOf('/')), key.slice(key.indexOf('/') + 1)];
            const dir = pipelineTypes.includes(type) ? `${type}/${base}${type}` : key;
            const url = `https://github.com/${repo}/tree/${encodeURIComponent(ver)}/${dir}`;
            return ` <a class="component-link" href="${url}" target="_blank" rel="noopener noreferrer" title="View component source on GitHub" aria-label="View ${escapeHtml(key)} source on GitHub">🔗</a>`;
        }

        // --- Dark mode toggle logic ---
        const darkToggle = document.getElementById('dark-mode-toggle');
        function setDarkMode(on) {
            document.body.classList.toggle('dark', on);
            darkToggle.textContent = on ? '☀️' : '🌙';
        }
        // Track if user has manually toggled
        let userDarkPref = localStorage.getItem('dark-mode');
        function applySystemDarkMode() {
            if (userDarkPref === null) {
                setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
            }
        }
        // Initial: follow system unless user toggled
        if (userDarkPref === null) {
            setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
        } else {
            setDarkMode(userDarkPref === '1');
        }
        // Listen for system changes if not overridden
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (localStorage.getItem('dark-mode') === null) {
                setDarkMode(e.matches);
            }
        });
        darkToggle.addEventListener('click', () => {
            const isDark = document.body.classList.toggle('dark');
            darkToggle.textContent = isDark ? '☀️' : '🌙';
            localStorage.setItem('dark-mode', isDark ? '1' : '0');
            userDarkPref = isDark ? '1' : '0';
        });

        // --- Detect components from pasted otel config ---
        const detectBtn = document.getElementById('detect-components-btn');
        const configPaste = document.getElementById('otel-config-paste');
        const detectStatus = document.getElementById('detect-components-status');
        detectBtn.addEventListener('click', function() {
            const text = configPaste.value;
            if (!text.trim()) {
                detectStatus.textContent = 'Paste a config first.';
                return;
            }
            const sectionToType = {
                receivers: 'receiver',
                exporters: 'exporter',
                processors: 'processor',
                extensions: 'extension',
                connectors: 'connector'
            };
            const sectionRe = /^(receivers|exporters|processors|extensions|connectors):\s*$/;
            const defined = new Set();
            // Match a config key like "splunk_hec/prod" against known
            // components: exact base match first, then separator-insensitive
            // (splunk_hec vs splunkhec).
            const matchComponent = (rawKey, type) => {
                const base = rawKey.split('/')[0].toLowerCase().trim();
                const baseLoose = base.replace(/[_\-.]/g, '');
                allComponentList.forEach(entry => {
                    if (!entry.base || entry.type !== type) return;
                    const entryBase = entry.base.toLowerCase();
                    if (entryBase === base || entryBase.replace(/[_\-.]/g, '') === baseLoose) {
                        defined.add(`${entry.base} (${entry.type})`);
                    }
                });
            };
            let section = '';
            text.split(/\r?\n/).forEach(line => {
                const secMatch = line.trim().match(sectionRe);
                if (secMatch) {
                    section = secMatch[1];
                    return;
                }
                // 2-space indented keys are the component instances of the section
                if (section) {
                    const m = line.match(/^  ([\w\-./]+):/);
                    if (m) {
                        matchComponent(m[1], sectionToType[section]);
                        return;
                    }
                }
                // Any new top-level key exits the section
                if (/^\w/.test(line) && !sectionRe.test(line.trim())) {
                    section = '';
                }
                // List entries inside a section (pipeline-style arrays)
                const pipelineMatch = line.match(/^\s*-\s*([\w\-./]+)\s*$/);
                if (pipelineMatch && section) {
                    matchComponent(pipelineMatch[1], sectionToType[section]);
                }
            });
            selectedSet.clear();
            const matched = [];
            defined.forEach(label => {
                if (allComponents.includes(label)) {
                    selectedSet.add(label);
                    matched.push(label);
                }
            });
            matched.sort();
            renderComponentList();
            updateUrlFromUI();
            detectStatus.textContent = matched.length ? `Selected: ${matched.join(', ')}` : 'No components detected.';
        });

        // Shared URLs land directly on results; otherwise show a hint.
        if (params.from || params.to || params.component) {
            runComparison();
        } else {
            resultsDiv.innerHTML = '<em>Choose versions and components, then press Compare.</em>';
        }
    }).catch(err => {
        console.error('Failed to load release data:', err);
        document.getElementById('results').innerHTML =
            '<strong>Failed to load release notes data.</strong> Try reloading the page; if it persists, the data files may be missing from the deployment.';
    });
});
