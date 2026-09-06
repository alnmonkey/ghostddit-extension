// Ctrl+G global force-reveal

    function findFeedElement() {
        return document.querySelector('shreddit-feed');
    }

    function hideFeedElement(el) {
        try { el.style.setProperty('display', 'none', 'important'); } catch (e) {}
    }

    function watchHiddenFeedElement(el) {
        if (forceStyleObserver && forceStyleObserverEl === el) return;
        stopWatchingHiddenFeed();
        forceStyleObserver = new MutationObserver(() => {
            if (!forceMode || forceHiddenEl !== el) return;
            if (el.style.display !== 'none') hideFeedElement(el);
        });
        forceStyleObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
        forceStyleObserverEl = el;
    }

    function stopWatchingHiddenFeed() {
        if (forceStyleObserver) {
            try { forceStyleObserver.disconnect(); } catch (e) {}
        }
        forceStyleObserver = null;
        forceStyleObserverEl = null;
    }

    function forceInject(ctx) {
        const feedEl = findFeedElement();
        if (!feedEl) return;

        if (forceHiddenEl && forceHiddenEl !== feedEl) {
            try { forceHiddenEl.style.removeProperty('display'); } catch (e) {}
            stopWatchingHiddenFeed();
        }

        forceHiddenEl = feedEl;
        hideFeedElement(feedEl);
        watchHiddenFeedElement(feedEl);

        injectAt(ctx, feedEl, '|force', 'Forced ');
    }

    function disableForceMode() {
        stopWatchingHiddenFeed();
        if (forceHiddenEl) {
            forceHiddenEl.style.removeProperty('display');
            forceHiddenEl = null;
        }
        const panel = document.getElementById(PANEL_ID);
        if (panel) {
            try { panel._ghostdditObserver?.disconnect(); } catch (e) {}
            panel.remove();
        }
        lastContextKey = null;
        generation += 1;
    }

    function toggleForceMode() {
        forceMode = !forceMode;
        writeForceModeCookie(forceMode);
        if (forceMode) {
            clearTimeout(injectCheckTimer);
            const ctx = parseProfileContext();
            if (ctx) forceInject(ctx);
        } else {
            disableForceMode();
            tryInject();
        }
    }

    document.addEventListener('keydown', (e) => {
        const key = (e.key || '').toLowerCase();
        if (key !== 'g' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleForceMode();
    }, true);

    window.addEventListener('ghostddit:locationchange', () => {
        if (forceHiddenEl) {
            stopWatchingHiddenFeed();
            try { forceHiddenEl.style.removeProperty('display'); } catch (e) {}
            forceHiddenEl = null;
        }
    });