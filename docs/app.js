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

            function updateVersions() {
                const project = projectSelect.value;
                const versions = Object.keys(data[project] || {}).filter(v => !v.startsWith('cmd/')).sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
                fromVersion.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');
                toVersion.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');
            }

            function updateComponents() {
                const project = projectSelect.value;
                const from = fromVersion.value;
                const to = toVersion.value;
                // Collect all components from all selected versions
                let components = new Set();
                [from, to].forEach(ver => {
                    if (data[project] && data[project][ver]) {
                        Object.keys(data[project][ver]).forEach(c => components.add(c));
                    }
                });
                components.delete(""); // Remove empty keys
                const sorted = Array.from(components).sort();
                componentFilter.innerHTML = '<option value="all">All</option>' + sorted.map(c => `<option value="${c}">${c}</option>`).join('');
            }

            projectSelect.addEventListener('change', updateVersions);
            fromVersion.addEventListener('change', updateComponents);
            toVersion.addEventListener('change', updateComponents);
            updateVersions();
            // Initial population
            updateComponents();

            document.getElementById('compare-btn').addEventListener('click', function() {
                const project = projectSelect.value;
                const from = fromVersion.value;
                const to = toVersion.value;
                const component = componentFilter.value;
                let results = [];
                // Compare upgrade notes for selected component(s) between versions
                if (data[project]) {
                    const fromNotes = data[project][from] || {};
                    const toNotes = data[project][to] || {};
                    let componentsToShow = component === 'all' ? Array.from(new Set([...Object.keys(fromNotes), ...Object.keys(toNotes)])) : [component];
                    componentsToShow = componentsToShow.filter(c => c && c !== '');
                    componentsToShow.forEach(c => {
                        const fromArr = fromNotes[c] || [];
                        const toArr = toNotes[c] || [];
                        if (fromArr.length || toArr.length) {
                            results.push(`<h3>${c}</h3>`);
                            results.push('<b>From:</b><ul>' + (fromArr.length ? fromArr.map(n => `<li>${n}</li>`).join('') : '<li>None</li>') + '</ul>');
                            results.push('<b>To:</b><ul>' + (toArr.length ? toArr.map(n => `<li>${n}</li>`).join('') : '<li>None</li>') + '</ul>');
                        }
                    });
                }
                document.getElementById('results').innerHTML = results.length ? results.join('') : '<em>No upgrade notes found for selection.</em>';
            });
        });

    // TODO: Populate versions/components from generated JSON
    // Add event listeners for compare button
});
