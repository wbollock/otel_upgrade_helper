// Placeholder for frontend logic
// This will be replaced by Go-generated data and logic

document.addEventListener('DOMContentLoaded', function() {
    // Load release notes data and components list
    Promise.all([
        fetch('data/release_notes.json').then(res => res.json()),
        fetch('data/components.json').then(res => res.json())
    ]).then(([data, allComponentList]) => {
        // Display generated timestamp
        if (data.generatedAt) {
            const appDiv = document.getElementById('app');
            const tsDiv = document.createElement('div');
            tsDiv.id = 'generated-timestamp';
            tsDiv.style = 'text-align:center;color:#888;font-size:0.98em;margin-bottom:0.7em;';
            tsDiv.textContent = `Release notes last generated: ${new Date(data.generatedAt).toLocaleString()}`;
            appDiv.insertBefore(tsDiv, appDiv.children[1]);
        }

        const projectSelect = document.getElementById('project-select');
        const fromVersion = document.getElementById('from-version');
        const toVersion = document.getElementById('to-version');
        const componentFilter = document.getElementById('component-filter');
        const resultsDiv = document.getElementById('results');
        const latestVersionSpan = document.getElementById('latest-version');

        function updateVersions() {
            const project = projectSelect.value;
            const versions = Object.keys(data[project] || {}).filter(v => !v.startsWith('cmd/')).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})).reverse();
            fromVersion.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');
            toVersion.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');
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
        let baseTypeToKeys = {}; // e.g. { 'loki:exporter': ['exporter/lokiexporter'] }
        let displayToBaseType = {}; // e.g. { 'loki (exporter)': 'loki:exporter' }
        function getTypeFromKey(key) {
            let m = key.match(/^(exporters?|receivers?|processors?|extensions?)\//);
            if (m) {
                let t = m[1];
                if (t.endsWith('s')) t = t.slice(0, -1);
                return t; // exporter, receiver, etc
            }
            return 'unknown';
        }

        function getBaseName(key) {
            // Remove type prefix (exporter/, receiver/, etc)
            let m = key.match(/^(exporters?|receivers?|processors?|extensions?)\/(.+)$/);
            if (m) {
                let base = m[2];
                // If base ends with exporter/receiver/processor/extension, strip it
                base = base.replace(/(exporter|receiver|processor|extension)$/i, '');
                return base;
            }
            // fallback: just use the part before a slash, or the whole key
            let base = key.split('/')[0];
            // Also strip exporter/receiver/processor/extension suffix if present
            base = base.replace(/(exporter|receiver|processor|extension)$/i, '');
            return base;
        }

        // Known type mapping for repo-only components
        const knownComponentTypes = {
            // exporters
            loki: 'exporter',
            file: 'exporter',
            otlp: 'receiver',
            prometheus: 'receiver',
            jaeger: 'exporter',
            zipkin: 'exporter',
            kafka: 'exporter',
            awsxray: 'exporter',
            otlphttp: 'exporter',
            syslog: 'exporter',
            datadog: 'exporter',
            sapm: 'exporter',
            signalfx: 'exporter',
            splunk_hec: 'exporter',
            googlecloud: 'exporter',
            elasticsearch: 'exporter',
            influxdb: 'exporter',
            sentry: 'exporter',
            wavefront: 'exporter',
            sumologic: 'exporter',
            clickhouse: 'exporter',
            kinesis: 'exporter',
            // receivers
            filelog: 'receiver',
            webhookevent: 'receiver',
            // processors
            batch: 'processor',
            memory_limiter: 'processor',
            filter: 'processor',
            resource: 'processor',
            attributes: 'processor',
            transform: 'processor',
            // extensions
            file_storage: 'extension',
            health_check: 'extension',
        };
        function normalizePrometheusBaseType(base, type) {
            // Normalize typos and unknowns for prometheus receiver
            const promBases = ['prometheus', 'prometheusreceiver', 'prometheusreciever'];
            if (promBases.includes(base.toLowerCase()) && (type === 'unknown' || type === 'receiver')) {
                return { base: 'prometheus', type: 'receiver' };
            }
            return { base, type };
        }

        function updateComponents(keepSelected = true) {
            const project = projectSelect.value;
            const from = fromVersion.value;
            const to = toVersion.value;
            let components = new Set();
            [from, to].forEach(ver => {
                if (data[project] && data[project][ver]) {
                    Object.keys(data[project][ver]).forEach(c => components.add(c));
                }
            });
            components.delete("");
            // Fix common typos in component names
            const fixed = Array.from(components).map(c => c.replace(/reciver/g, 'receiver'));
            // Build base+type mapping from release notes
            baseTypeToKeys = {};
            fixed.forEach(c => {
                let base = getBaseName(c);
                let type = getTypeFromKey(c);
                // Normalize prometheus receiver
                ({ base, type } = normalizePrometheusBaseType(base, type));
                const key = `${base}:${type}`;
                if (!baseTypeToKeys[key]) baseTypeToKeys[key] = [];
                baseTypeToKeys[key].push(c);
            });
            // --- Merge in all components from components.json ---
            allComponentList.forEach(entry => {
                let base = entry.base;
                let type = entry.type;
                if (!base || !type) return;
                // Normalize prometheus receiver
                ({ base, type } = normalizePrometheusBaseType(base, type));
                // Infer type if unknown
                if (type === 'unknown' && knownComponentTypes[base]) {
                    type = knownComponentTypes[base];
                }
                if (type === 'unknown' || !type) return; // skip still-unknown
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

        document.getElementById('compare-btn').addEventListener('click', function() {
            const project = projectSelect.value;
            const from = fromVersion.value;
            const to = toVersion.value;
            const component = componentFilter.value;
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
                selectedVersions.forEach(ver => {
                    const notesData = data[project][ver] || {};
                    let componentsToShow = component === 'all' ? Object.keys(notesData) : [component];
                    componentsToShow = componentsToShow.filter(c => c && c !== '');
                    let notesFound = false;
                    let notesHtml = '';
                    componentsToShow.forEach(c => {
                        // Fix typo in display as well
                        const displayC = c.replace(/reciver/g, 'receiver');
                        let notesArr = notesData[c] || [];
                        // Deduplicate notes
                        notesArr = Array.from(new Set(notesArr));
                        if (notesArr.length) {
                            notesFound = true;
                            // Add GitHub link to component dir
                            let repo = project === 'otelcol' ? 'open-telemetry/opentelemetry-collector' : 'open-telemetry/opentelemetry-collector-contrib';
                            let compPath = c === '(general)' ? '' : `/tree/main/${c}`;
                            let compLink = c === '(general)' ? '' : ` <a href='https://github.com/${repo}${compPath}' target='_blank' rel='noopener noreferrer' title='View component source on GitHub' style='font-size:0.95em;margin-left:0.3em;'>🔗</a>`;
                            notesHtml += `<h4 class=\"component-name\">${displayC}${compLink}</h4><ul class=\"notes-list\">` + notesArr.map(n => `<li>${linkifyPRs(n, project)}</li>`).join('') + '</ul>';
                        }
                    });
                    if (notesFound) {
                        results.push(`<div class="release-block"><h3 class="version-header">${ver}</h3>${notesHtml}</div>`);
                    }
                });
            }
            resultsDiv.innerHTML = results.length ? results.join('') : '<em>No upgrade notes found for selection.</em>';
        });

        // Helper to linkify PR numbers in note text
        function linkifyPRs(note, project) {
            // Match #12345 not already inside a link
            return note.replace(/#(\d{3,7})(?![\w\d]*\])/g, function(match, prNum) {
                let repo = project === 'otelcol' ? 'open-telemetry/opentelemetry-collector' : 'open-telemetry/opentelemetry-collector-contrib';
                let url = `https://github.com/${repo}/pull/${prNum}`;
                return `<a href="${url}" target="_blank" rel="noopener noreferrer">${match}</a>`;
            });
        }

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
        if (params.component) {
            // Multi-select support
            const vals = params.component.split(',');
            Array.from(componentFilter.options).forEach(opt => {
                if (vals.includes(opt.value)) opt.selected = true;
            });
        }

        // When any select changes, update URL
        function updateUrlFromUI() {
            setQueryParams({
                project: projectSelect.value,
                from: fromVersion.value,
                to: toVersion.value,
                component: getSelectedComponents().join(',')
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
                selectedVersions.forEach(ver => {
                    const notesData = data[project][ver] || {};
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
                    componentsToShow = componentsToShow.filter(c => c && c !== '');
                    let notesFound = false;
                    let notesHtml = '';
                    componentsToShow.forEach(c => {
                        // Fix typo in display as well
                        const displayC = c.replace(/reciver/g, 'receiver');
                        let notesArr = notesData[c] || [];
                        // Deduplicate notes
                        notesArr = Array.from(new Set(notesArr));
                        if (notesArr.length) {
                            notesFound = true;
                            // Add GitHub link to component dir
                            let repo = project === 'otelcol' ? 'open-telemetry/opentelemetry-collector' : 'open-telemetry/opentelemetry-collector-contrib';
                            let compPath = c === '(general)' ? '' : `/tree/main/${c}`;
                            let compLink = c === '(general)' ? '' : ` <a href='https://github.com/${repo}${compPath}' target='_blank' rel='noopener noreferrer' title='View component source on GitHub' style='font-size:0.95em;margin-left:0.3em;'>🔗</a>`;
                            notesHtml += `<h4 class=\"component-name\">${displayC}${compLink}</h4><ul class=\"notes-list\">` + notesArr.map(n => `<li>${linkifyPRs(n, project)}</li>`).join('') + '</ul>';
                        }
                    });
                    if (notesFound) {
                        results.push(`<div class="release-block"><h3 class="version-header">${ver}</h3>${notesHtml}</div>`);
                    }
                });
            }
            resultsDiv.innerHTML = results.length ? results.join('') : '<em>No upgrade notes found for selection.</em>';
        });

        // Helper to linkify PR numbers in note text
        function linkifyPRs(note, project) {
            // Match #12345 not already inside a link
            return note.replace(/#(\d{3,7})(?![\w\d]*\])/g, function(match, prNum) {
                let repo = project === 'otelcol' ? 'open-telemetry/opentelemetry-collector' : 'open-telemetry/opentelemetry-collector-contrib';
                let url = `https://github.com/${repo}/pull/${prNum}`;
                return `<a href="${url}" target="_blank" rel="noopener noreferrer">${match}</a>`;
            });
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
                        // Normalize prometheus receiver
                        if (["prometheusreceiver","prometheusreciever"].includes(base)) base = "prometheus";
                        // For this base, find all types in components.json (case-insensitive, ignore spaces)
                        allComponentList.forEach(entry => {
                            if (entry.base && entry.type && entry.type !== 'unknown') {
                                let entryBase = entry.base.toLowerCase().replace(/\s+/g, '');
                                // Normalize prometheus receiver
                                if (["prometheusreceiver","prometheusreciever"].includes(entryBase)) entryBase = "prometheus";
                                if (entryBase === base) {
                                    defined.add(`${entry.base} (${entry.type === 'unknown' ? 'receiver' : entry.type})`);
                                }
                            }
                        });
                        // Also try legacy/ambiguous cases
                        ['exporter','receiver','processor','extension'].forEach(suffix => defined.add(`${base} (${suffix})`));
                    }
                    return;
                }
                // If new top-level key, exit section
                if (/^\w/.test(line.trim()) && !/^(receivers|exporters|processors|extensions):/.test(line.trim())) {
                    section = '';
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
