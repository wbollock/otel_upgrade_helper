// Placeholder for frontend logic
// This will be replaced by Go-generated data and logic

document.addEventListener('DOMContentLoaded', function() {
    // Load release notes data
    fetch('data/release_notes.json')
        .then(res => res.json())
        .then(data => {
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
                const sorted = Array.from(new Set(fixed)).sort();
                allComponents = sorted;
                fuse = new window.Fuse(sorted, { includeScore: true, threshold: 0.4 });
                // Multi-select: restore previous selection
                let prevSelected = [];
                if (keepSelected) {
                    prevSelected = Array.from(componentFilter.selectedOptions).map(o => o.value);
                }
                componentFilter.innerHTML = sorted.map(c => `<option value="${c}">${c}</option>`).join('');
                // Restore previous selection if possible
                prevSelected.forEach(val => {
                    const opt = Array.from(componentFilter.options).find(o => o.value === val);
                    if (opt) opt.selected = true;
                });
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
                const components = getSelectedComponents();
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
                        let componentsToShow = components.length === 0 || components.includes('all') ? Object.keys(notesData) : components;
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
                // Only use the part before the slash for matching (e.g., 'loki' from 'loki/staging')
                let defined = new Set();
                let section = '';
                text.split(/\r?\n/).forEach(line => {
                    const trimmed = line.trim();
                    if (/^(receivers|exporters|processors|extensions):\s*$/.test(trimmed)) {
                        section = trimmed.replace(':','');
                    } else if (section && /^([\w\-\.\/]+):/.test(trimmed)) {
                        const m = trimmed.match(/^([\w\-\.\/]+):/);
                        if (m) defined.add(m[1].split('/')[0]);
                    } else if (/^\w/.test(trimmed)) {
                        section = '';
                    }
                });
                // Find all referenced components in pipelines (including slashes)
                let pipelineRefs = new Set();
                const pipelineBlock = text.split(/pipelines:/)[1];
                if (pipelineBlock) {
                    // Find all - name or - name/variant under pipelines
                    const refRegex = /-\s*([\w\-\.\/]+)/g;
                    let m;
                    while ((m = refRegex.exec(pipelineBlock))) {
                        pipelineRefs.add(m[1].split('/')[0]);
                    }
                }
                // Get all available options
                const options = Array.from(componentFilter.options);
                // Always clear previous selections
                options.forEach(opt => { opt.selected = false; });
                let matched = [];
                // For all defined and referenced base names, select all options that start with that base name
                let allBaseNames = new Set([...defined, ...pipelineRefs]);
                allBaseNames.forEach(base => {
                    options.forEach(opt => {
                        if (opt.value.startsWith(base) && !matched.includes(opt.value)) {
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
