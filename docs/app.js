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

            function updateVersions() {
                const project = projectSelect.value;
                const versions = Object.keys(data[project] || {}).filter(v => !v.startsWith('cmd/')).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})).reverse();
                fromVersion.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');
                toVersion.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');
                updateComponents();
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
                const sorted = Array.from(new Set(fixed)).sort();
                const prevSelected = keepSelected ? componentFilter.value : 'all';
                componentFilter.innerHTML = '<option value="all">All</option>' + sorted.map(c => `<option value="${c}">${c}</option>`).join('');
                // Restore previous selection if possible
                if (sorted.includes(prevSelected)) {
                    componentFilter.value = prevSelected;
                } else {
                    componentFilter.value = 'all';
                }
            }

            projectSelect.addEventListener('change', () => updateVersions());
            fromVersion.addEventListener('change', () => updateComponents(true));
            toVersion.addEventListener('change', () => updateComponents(true));
            updateVersions();

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
                            const notesArr = notesData[c] || [];
                            if (notesArr.length) {
                                notesFound = true;
                                notesHtml += `<h4 class="component-name">${displayC}</h4><ul class="notes-list">` + notesArr.map(n => `<li>${linkifyPRs(n, project)}</li>`).join('') + '</ul>';
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
        });
});
