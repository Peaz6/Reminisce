// ==============================================
// Auth helpers: current user, profile, sign out
// Talks to the local Express API (/api/me etc.)
// ==============================================

(function (global) {

    // Small fetch wrapper: same-origin, JSON, throws on error status
    async function api(path, options) {

        var opts = options || {};

        var fetchOpts = {
            method: opts.method || "GET",
            credentials: "same-origin"
        };

        var body = opts.body;

        if (body) {
            fetchOpts.headers = { "Content-Type": "application/json" };
            fetchOpts.body = JSON.stringify(body);
        }

        var res = await fetch(path, fetchOpts);

        var data = null;
        try { data = await res.json(); }
        catch (e) { data = null; }

        if (!res.ok) {
            var err = new Error((data && data.error) || "Request failed");
            err.status = res.status;
            throw err;
        }

        return data;
    }

    // Returns the logged-in user {id, full_name, email, phone} or null
    async function getProfile() {
        try {
            var data = await api("/api/me");
            return data.user || null;
        }
        catch (e) {
            return null;
        }
    }

    // Compatibility alias
    async function getCurrentUser() {
        return getProfile();
    }

    // Compatibility alias used on load to decide nav state.
    // Returns a session-ish object or null.
    async function getSession() {
        var profile = await getProfile();
        return profile ? { user: profile } : null;
    }

    async function signOut() {
        await api("/api/logout", { method: "POST" });
    }

    // Subscribes once on every page so the nav button
    // updates automatically when login state changes.
    function initNavAuth() {
        initMobileNav();
        renderNav();
    }

    // Builds the mobile hamburger menu (shared on all pages).
    // The toggle button + dropdown panel are injected via JS so the
    // static HTML stays unchanged. Panel content is mirrored from the
    // real nav each time it opens so login state stays in sync.
    function initMobileNav() {

        var topNav = document.querySelector(".top-nav");

        if (!topNav) return;

        if (document.querySelector(".nav-toggle")) return;

        // --- toggle button (logo right side) ---
        var toggle = document.createElement("button");

        toggle.type = "button";
        toggle.className = "nav-toggle";
        toggle.setAttribute("aria-label", "Open menu");
        toggle.setAttribute("aria-expanded", "false");

        toggle.innerHTML =
            '<span class="toggle-bar"></span>' +
            '<span class="toggle-bar"></span>' +
            '<span class="toggle-bar"></span>';

        topNav.appendChild(toggle);

        // --- dropdown panel ---
        var panel = document.createElement("div");
        panel.className = "nav-panel";

        var linksBox = document.createElement("div");
        linksBox.className = "nav-panel-links";

        var divider = document.createElement("div");
        divider.className = "nav-panel-divider";

        var actionsBox = document.createElement("div");
        actionsBox.className = "nav-panel-actions";

        panel.appendChild(linksBox);
        panel.appendChild(divider);
        panel.appendChild(actionsBox);

        document.body.appendChild(panel);

        function syncPanel() {

            var links = document.querySelector(".nav-links");
            var actions = document.querySelector(".nav-actions");

            if (links) linksBox.innerHTML = links.innerHTML;

            if (actions) {
                actionsBox.innerHTML = actions.innerHTML;

                // The logout button inside the panel needs its own handler
                // (the original lives in the hidden desktop nav).
                var logoutBtn = actionsBox.querySelector("#logoutBtn");

                if (logoutBtn) {
                    logoutBtn.addEventListener("click", async function () {
                        await signOut();
                        renderNav();
                        syncPanel();
                    });
                }
            }
        }

        function setOpen(open) {
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
            panel.classList.toggle("open", open);
        }

        toggle.addEventListener("click", function (ev) {
            ev.stopPropagation();
            syncPanel();
            setOpen(!panel.classList.contains("open"));
        });

        document.addEventListener("click", function (ev) {
            if (!panel.classList.contains("open")) return;
            if (panel.contains(ev.target) || toggle.contains(ev.target)) return;
            setOpen(false);
        });

        document.addEventListener("keydown", function (ev) {
            if (ev.key === "Escape") setOpen(false);
        });

        window.addEventListener("resize", function () {
            if (window.matchMedia("(max-width: 800px)").matches === false) {
                setOpen(false);
            }
        });
    }

    async function renderNav() {

        var navActions = document.querySelector(".nav-actions");

        if (!navActions) return;

        var profile = await getProfile();

        if (!profile) {

            // Logged out: show "Log In" button that links to the login page.
            var loginLink = navActions.querySelector(".login-btn");

            if (loginLink) {
                loginLink.href = loginPageRelPath();
                loginLink.textContent = "Log In";
            }

            return;
        }

        // Logged in: show user's name + Logout button
        var displayName = profile.full_name || profile.email || "User";

        navActions.innerHTML =
            '<span class="user-chip" title="' + escapeHtml(profile.email || "") + '">' +
                escapeHtml(displayName) +
            '</span>' +
            '<button type="button" class="login-btn" id="logoutBtn">Log Out</button>';

        var logoutBtn = document.getElementById("logoutBtn");

        if (logoutBtn) {
            logoutBtn.addEventListener("click", async function () {
                await signOut();
                renderNav();
            });
        }
    }

    // login.html always lives in the site root. Compute the correct
    // relative URL from the current page (e.g. from /Food/ it is ../login.html).
    function loginPageRelPath() {
        var dirs = window.location.pathname
            .split("/")
            .slice(0, -1)
            .filter(function (d) { return d.length > 0; });

        return dirs
            .map(function () { return ".."; })
            .concat(["login.html"])
            .join("/");
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    global.ReminisceAuth = {
        initNavAuth: initNavAuth,
        getSession: getSession,
        getProfile: getProfile,
        getCurrentUser: getCurrentUser,
        signOut: signOut
    };

})(window);