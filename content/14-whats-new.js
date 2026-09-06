// Show a one-time "what's new" panel the first time a Reddit page loads

const WHATS_NEW_PENDING_KEY = 'ghostddit_whats_new_pending';
const WHATS_NEW_DISMISSED_KEY = 'ghostddit_whats_new_dismissed_version';
const OVERLAY_ID = 'ghostddit-whats-new-overlay';

function renderWhatsNew(pending) {
    if (!pending || !pending.version || !Array.isArray(pending.features) || !pending.features.length) return;
    if (document.getElementById(OVERLAY_ID)) return;

    chrome.storage.local.get([WHATS_NEW_DISMISSED_KEY], (res) => {
        if (res[WHATS_NEW_DISMISSED_KEY] === pending.version) return;
        if (document.getElementById(OVERLAY_ID)) return;

        const heading = pending.reason === 'install'
            ? 'Welcome to Ghostddit'
            : "What's new in Ghostddit";

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.innerHTML = `
            <div class="ghostddit-whats-new-modal" role="dialog" aria-modal="true" aria-label="${esc(heading)}">
                <button type="button" class="ghostddit-whats-new-close" aria-label="Close">&times;</button>
                <div class="ghostddit-whats-new-head">
                    <span class="ghostddit-badge">v${esc(pending.version)}</span>
                    <h2>${esc(heading)}</h2>
                </div>
                <ul class="ghostddit-whats-new-list">
                    ${pending.features.map((f) => `<li>${esc(f)}</li>`).join('')}
                </ul>
                <div class="ghostddit-whats-new-actions">
                    <button type="button" class="ghostddit-whats-new-dismiss">Got it</button>
                </div>
            </div>
        `;

        function dismiss() {
            chrome.storage.local.set({ [WHATS_NEW_DISMISSED_KEY]: pending.version });
            overlay.remove();
        }

        overlay.querySelector('.ghostddit-whats-new-close').addEventListener('click', dismiss);
        overlay.querySelector('.ghostddit-whats-new-dismiss').addEventListener('click', dismiss);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) dismiss();
        });
        document.addEventListener('keydown', function onKeydown(e) {
            if (e.key !== 'Escape') return;
            document.removeEventListener('keydown', onKeydown);
            dismiss();
        });

        document.documentElement.appendChild(overlay);
    });
}

function initWhatsNew() {
    if (!isExtensionContextValid()) return;

    chrome.storage.local.get([WHATS_NEW_PENDING_KEY], (res) => {
        renderWhatsNew(res[WHATS_NEW_PENDING_KEY]);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[WHATS_NEW_PENDING_KEY]) {
            renderWhatsNew(changes[WHATS_NEW_PENDING_KEY].newValue);
        }
    });
}
