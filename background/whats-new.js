// Queue a one-time "what's new" notice when the extension is installed

const WHATS_NEW_PENDING_KEY = 'ghostddit_whats_new_pending';

const WHATS_NEW = {
    '3.0.1': [
        'Upvote and Downvote posts and comments on the ghostddit revealed posts and comments.',
        'CTRL+G / CMD+G force-reveal: Force ghostddit to work on all profiles public & hidden.',
        'Bug Fixes',
    ]
};

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== 'install' && details.reason !== 'update') return;

    const version = chrome.runtime.getManifest().version;
    const features = WHATS_NEW[version];
    if (!features || !features.length) return;

    chrome.storage.local.set({
        [WHATS_NEW_PENDING_KEY]: { version, features, reason: details.reason }
    });
});
