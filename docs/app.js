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
        const componentFilter = document.getElementById('component-filter');
        const resultsDiv = document.getElementById('results');
        const latestVersionSpan = document.getElementById('latest-version');

        // Add 'All Components' button
        const allComponentsBtn = document.createElement('button');
        allComponentsBtn.textContent = 'Select All Components';
        allComponentsBtn.style = 'margin-bottom:0.7em;padding:0.4em 1.2em;border-radius:6px;font-size:1em;background:#ececf6;border:1px solid #bbb;';
        componentFilter.parentNode.insertBefore(allComponentsBtn, componentFilter);
        allComponentsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            Array.from(componentFilter.options).forEach(opt => { opt.selected = true; });
            // Do NOT dispatch change event, just update UI
        });

        function updateVersions() {
            const project = projectSelect.value;
            const versions = Object.keys(data[project] || {}).filter(v => !v.startsWith('cmd/')).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})).reverse();
            fromVersion.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');
            toVersion.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');
            // Start from version about 10 versions back, or first if less
            if (versions.length > 0) {
                fromVersion.value = versions[Math.min(10, versions.length-1)];
                toVersion.value = versions[0];
            }
            updateComponents();
        }

        function updateLatestVersion() {
            const project = projectSelect.value;
            const versions = Object.keys(data[project] || {}).filter(v => !v.startsWith('cmd/')).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})).reverse();
            if (versions.length > 0) {
                latestVersionSpan.textContent = `Latest: ${versions[0]}`;
            } else {
                latestVersionSpan.textContent = '';
            }
        }

        // --- Fuzzy search and multi-select for components ---
        const componentSearch = document.getElementById('component-search');
        let allComponents = [];
        let fuse = null;

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

        function updateComponents(keepSelected = true) {
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
            fuse = new window.Fuse(displayList, { includeScore: true, threshold: 0.4 });
            // Multi-select: restore previous selection
            let prevSelected = [];
            if (keepSelected) {
                prevSelected = Array.from(componentFilter.selectedOptions).map(o => o.value);
            }
            componentFilter.innerHTML = displayList.map(c => `<option value="${c}"${prevSelected.includes(c)?' selected':''}>${c}</option>`).join('');
        }

        // Fuzzy search for components
        componentSearch.addEventListener('input', function() {
            const q = componentSearch.value.trim();
            let filtered = allComponents;
            if (q && fuse) {
                filtered = fuse.search(q).map(r => r.item);
            }
            // Keep current selection
            const selected = Array.from(componentFilter.selectedOptions).map(o => o.value);
            componentFilter.innerHTML = filtered.map(c => `<option value="${c}"${selected.includes(c)?' selected':''}>${c}</option>`).join('');
        });

        projectSelect.addEventListener('change', () => { updateVersions(); updateLatestVersion(); });
        fromVersion.addEventListener('change', () => updateComponents(true));
        toVersion.addEventListener('change', () => updateComponents(true));
        updateVersions();
        updateLatestVersion();

        // Set default project to otelcol-contrib
        projectSelect.value = 'otelcol-contrib';
        updateVersions();
        updateLatestVersion();

        // --- Update URL logic for multi-select ---
        function getSelectedComponents() {
            return Array.from(componentFilter.selectedOptions).map(o => o.value);
        }
        function setQueryParams(params) {
            const q = Object.entries(params).map(([k,v]) => {
                if (Array.isArray(v)) return `${encodeURIComponent(k)}=${encodeURIComponent(v.join(','))}`;
                return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
            }).join('&');
            history.replaceState(null, '', '?' + q);
        }
        function getQueryParams() {
            const params = {};
            window.location.search.replace(/\??([^=&]+)=([^&]*)/g, function(_, k, v) {
                params[decodeURIComponent(k)] = decodeURIComponent(v);
            });
            return params;
        }

        // On load, set selects from URL if present
        const params = getQueryParams();
        if (params.project) projectSelect.value = params.project;
        updateVersions();
        if (params.from) fromVersion.value = params.from;
        if (params.to) toVersion.value = params.to;
        updateComponents();
        if (params.component === 'all') {
            Array.from(componentFilter.options).forEach(opt => { opt.selected = true; });
        } else if (params.component) {
            // Multi-select support
            const vals = params.component.split(',');
            Array.from(componentFilter.options).forEach(opt => {
                if (vals.includes(opt.value)) opt.selected = true;
            });
        }

        // When any select changes, update URL
        function updateUrlFromUI() {
            const selected = getSelectedComponents();
            const options = Array.from(componentFilter.options);
            // Selecting every component can produce a component list many KB
            // long, which throws "URI too long" from history.replaceState.
            // Use a compact "all" sentinel instead of serializing every value.
            const component = (options.length > 0 && selected.length === options.length) ? 'all' : selected.join(',');
            setQueryParams({
                project: projectSelect.value,
                from: fromVersion.value,
                to: toVersion.value,
                component
            });
        }
        projectSelect.addEventListener('change', () => { updateVersions(); updateLatestVersion(); updateUrlFromUI(); });
        fromVersion.addEventListener('change', () => { updateComponents(true); updateUrlFromUI(); });
        toVersion.addEventListener('change', () => { updateComponents(true); updateUrlFromUI(); });
        componentFilter.addEventListener('change', updateUrlFromUI);

        // Also update URL on compare
        document.getElementById('compare-btn').addEventListener('click', function() {
            updateUrlFromUI();
            const project = projectSelect.value;
            const from = fromVersion.value;
            const to = toVersion.value;
            const selectedDisplays = getSelectedComponents();
            let results = [];
            if (data[project]) {
                // Get all versions between from and to (inclusive, sorted)
                const versions = Object.keys(data[project] || {}).filter(v => !v.startsWith('cmd/')).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
                const fromIdx = versions.indexOf(from);
                const toIdx = versions.indexOf(to);
                if (fromIdx === -1 || toIdx === -1) {
                    resultsDiv.innerHTML = '<em>Invalid version selection.</em>';
                    return;
                }
                const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
                const selectedVersions = versions.slice(start, end + 1);
                // For each version, show notes for the selected component(s)
                const repo = repoForProject(project);
                selectedVersions.forEach(ver => {
                    const notesData = versionComponents(project, ver);
                    let componentsToShow = [];
                    if (selectedDisplays.length === 0 || selectedDisplays.includes('all')) {
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
                    let notesFound = false;
                    let notesHtml = '';
                    componentsToShow.forEach(c => {
                        const notesArr = dedupeNotes(notesData[c] || []);
                        if (notesArr.length) {
                            notesFound = true;
                            notesHtml += `<h4 class="component-name">${escapeHtml(c)}${componentSourceLink(repo, ver, c)}</h4>`
                                + `<ul class="notes-list">` + notesArr.map(n => renderNote(n, repo)).join('') + '</ul>';
                        }
                    });
                    if (notesFound) {
                        const dateStr = versionEntry(project, ver).date;
                        const dateHtml = dateStr ? `<span class="version-date">${escapeHtml(dateStr)}</span>` : '';
                        const releaseUrl = `https://github.com/${repo}/releases/tag/${encodeURIComponent(ver)}`;
                        const releaseLink = ` <a class="release-link" href="${releaseUrl}" target="_blank" rel="noopener noreferrer" title="View the full release notes on GitHub">View full release notes ↗</a>`;
                        results.push(`<div class="release-block"><h3 class="version-header">${escapeHtml(ver)} ${dateHtml}${releaseLink}</h3>${notesHtml}</div>`);
                    }
                });
            }
            resultsDiv.innerHTML = results.length ? results.join('') : '<em>No upgrade notes found for selection.</em>';
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
            // Map section to type
            const sectionToType = {
                exporters: 'exporter',
                receivers: 'receiver',
                processors: 'processor',
                extensions: 'extension'
            };
            let defined = new Set();
            let section = '';
            text.split(/\r?\n/).forEach(line => {
                // Detect section start
                const secMatch = line.trim().match(/^(receivers|exporters|processors|extensions):\s*$/);
                if (secMatch) {
                    section = secMatch[1];
                    return;
                }
                // If in section, match exactly 2-space indented keys (YAML first-level keys)
                if (section && /^  ([\w\-\./]+):/.test(line)) {
                    const m = line.match(/^  ([\w\-\./]+):/);
                    if (m) {
                        let base = m[1].split('/')[0].toLowerCase().replace(/\s+/g, '');
                        if (["prometheusreceiver","prometheusreciever"].includes(base)) base = "prometheus";
                        let type = sectionToType[section];
                        let found = false;

                        // First try exact matching
                        allComponentList.forEach(entry => {
                            if (entry.base && entry.type && entry.type !== 'unknown') {
                                let entryBase = entry.base.toLowerCase().replace(/\s+/g, '');
                                if (["prometheusreceiver","prometheusreciever"].includes(entryBase)) entryBase = "prometheus";
                                if (entryBase === base && entry.type === type) {
                                    defined.add(`${entry.base} (${entry.type})`);
                                    found = true;
                                }
                            }
                        });

                        // If no exact match, try fuzzy matching by removing separators
                        if (!found) {
                            const baseFuzzy = base.replace(/[_\-\.]/g, '');
                            allComponentList.forEach(entry => {
                                if (entry.base && entry.type && entry.type !== 'unknown') {
                                    let entryBase = entry.base.toLowerCase().replace(/\s+/g, '').replace(/[_\-\.]/g, '');
                                    if (["prometheusreceiver","prometheusreciever"].includes(entryBase)) entryBase = "prometheus";
                                    if (entryBase === baseFuzzy && entry.type === type) {
                                        defined.add(`${entry.base} (${entry.type})`);
                                    }
                                }
                            });
                        }
                    }
                    return;
                }
                // If new top-level key, exit section
                if (/^\w/.test(line.trim()) && !/^(receivers|exporters|processors|extensions):/.test(line.trim())) {
                    section = '';
                }
                // --- Detect components in service.pipelines arrays ---
                const pipelineMatch = line.match(/^\s*-(\s*)([\w\-\./]+)$/);
                if (pipelineMatch && section) {
                    let comp = pipelineMatch[2];
                    let base = comp.split('/')[0].toLowerCase().replace(/\s+/g, '');
                    if (["prometheusreceiver","prometheusreciever"].includes(base)) base = "prometheus";
                    let type = sectionToType[section];
                    let found = false;

                    // First try exact matching
                    allComponentList.forEach(entry => {
                        if (entry.base && entry.type && entry.type !== 'unknown') {
                            let entryBase = entry.base.toLowerCase().replace(/\s+/g, '');
                            if (["prometheusreceiver","prometheusreciever"].includes(entryBase)) entryBase = "prometheus";
                            if (entryBase === base && entry.type === type) {
                                defined.add(`${entry.base} (${entry.type})`);
                                found = true;
                            }
                        }
                    });

                    // If no exact match, try fuzzy matching by removing separators
                    if (!found) {
                        const baseFuzzy = base.replace(/[_\-\.]/g, '');
                        allComponentList.forEach(entry => {
                            if (entry.base && entry.type && entry.type !== 'unknown') {
                                let entryBase = entry.base.toLowerCase().replace(/\s+/g, '').replace(/[_\-\.]/g, '');
                                if (["prometheusreceiver","prometheusreciever"].includes(entryBase)) entryBase = "prometheus";
                                if (entryBase === baseFuzzy && entry.type === type) {
                                    defined.add(`${entry.base} (${entry.type})`);
                                }
                            }
                        });
                    }
                }
            });
            // Get all available options
            const options = Array.from(componentFilter.options);
            options.forEach(opt => { opt.selected = false; });
            let matched = [];
            // Select options whose label matches any detected base+type
            defined.forEach(label => {
                options.forEach(opt => {
                    if (opt.value === label && !matched.includes(opt.value)) {
                        opt.selected = true;
                        matched.push(opt.value);
                    }
                });
            });
            detectStatus.textContent = matched.length ? `Selected: ${matched.join(', ')}` : 'No components detected.';
            componentFilter.dispatchEvent(new Event('change'));
        });
    });
});
