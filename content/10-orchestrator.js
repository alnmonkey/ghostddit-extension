// Inject the panel when the profile view is detected.

    function injectAt(ctx, anchorEl, keySuffix, headerPrefix) {
        const key = contextKey(ctx) + (keySuffix || '');

        if (key === lastContextKey) {
            const panel = document.getElementById(PANEL_ID);
            if (panel && !panel.isConnected) {
                anchorEl.insertAdjacentElement('afterend', panel);
            } else if (!panel) {
                lastContextKey = null;
                injectAt(ctx, anchorEl, keySuffix, headerPrefix);
            }
            return;
        }

        lastContextKey = key;
        generation += 1;
        const myGeneration = generation;

        const oldPanel = document.getElementById(PANEL_ID);
        if (oldPanel) {
            try { oldPanel._ghostdditObserver?.disconnect(); } catch (e) {}
            oldPanel.remove();
        }

        if (ctx.tab === 'comments') {
            currentCommentsUsername = ctx.username;
            currentCommentsSort = ctx.sort;
            seenCommentIds = new Set();
            nextCommentsUrl = null;
            commentsLoading = false;
            commentsExhausted = false;

            const panel = ensurePanel(anchorEl, { headerText: `${headerPrefix || ''}Revealed Comments` });
            try { panel._ghostdditObserver?.disconnect(); } catch (e) {}
            setupCommentsSentinel(panel, myGeneration);
            loadComments(myGeneration, panel);
            return;
        }

        currentUsername = ctx.username;
        currentSort = ctx.sort;
        currentTimeframe = ctx.timeframe;
        afterToken = null;
        exhausted = false;
        loading = false;
        seenPostIds = new Set();

        ensurePanel(anchorEl, { headerText: `${headerPrefix || ''}Revealed Posts` });
        loadMore(myGeneration);
    }

    function removeStalePanel() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        try { panel._ghostdditObserver?.disconnect(); } catch (e) {}
        panel.remove();
        lastContextKey = null;
    }

    function tryInject() {
        if (!isExtensionContextValid()) {
            handleInvalidContext();
            return;
        }

        if (forceMode) {
            const forceCtx = parseProfileContext();
            if (forceCtx) forceInject(forceCtx);
            return;
        }

        const ctx = parseProfileContext();
        if (!ctx) return;

        if (!findEmptyFeedContent()) {
            removeStalePanel();
            return;
        }

        clearTimeout(injectCheckTimer);
        const key = contextKey(ctx);
        injectCheckTimer = setTimeout(() => {
            if (forceMode) return;

            const stillCtx = parseProfileContext();
            if (!stillCtx || contextKey(stillCtx) !== key) return;

            const stillEmptyEl = findEmptyFeedContent();
            if (!stillEmptyEl) {
                removeStalePanel();
                return;
            }

            injectAt(stillCtx, stillEmptyEl, '', '');
        }, 400);
    }