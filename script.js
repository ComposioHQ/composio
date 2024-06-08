const handleAddImage = () => {
    if (!window.location.href.includes("framework/crewai")) {
        requestAnimationFrame(() => {
            handleAddImage();
        });
        return;
    }
    const h1 = document.querySelector("h1");
    const isMobile = window.innerWidth < 768;
    //if h1 doesn't contain image, add it
    if (!h1.querySelector("img")) {
        const img = document.createElement("img");
        img.src = "https://github.com/joaomdmoura/crewAI/raw/main/docs/crewai_logo.png";


        img.style.height = isMobile ? "32px" : "32px";


        h1.insertBefore(img, h1.firstChild);
    }

    h1.style.display = "flex";
    h1.style.justifyContent = "center";
    h1.style.alignItems = "center";
    h1.style.gap = "12px";

    requestAnimationFrame(() => {
        handleAddImage();
    });

}
requestAnimationFrame(handleAddImage);


(() => {

    console.log("init analytics")

    // LOAD POSTHOG W PROXY
    const POSTHOG_INGEST = 'https://app.composio.dev/ingest'
    !function (t, e) { var o, n, p, r; e.__SV || (window.posthog = e, e._i = [], e.init = function (i, s, a) { function g(t, e) { var o = e.split("."); 2 == o.length && (t = t[o[0]], e = o[1]), t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } } (p = t.createElement("script")).type = "text/javascript", p.async = !0, p.src = s.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") + "/static/array.js", (r = t.getElementsByTagName("script")[0]).parentNode.insertBefore(p, r); var u = e; for (void 0 !== a ? u = e[a] = [] : a = "posthog", u.people = u.people || [], u.toString = function (t) { var e = "posthog"; return "posthog" !== a && (e += "." + a), t || (e += " (stub)"), e }, u.people.toString = function () { return u.toString(1) + ".people (stub)" }, o = "capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "), n = 0; n < o.length; n++)g(u, o[n]); e._i.push([i, s, a]) }, e.__SV = 1) }(document, window.posthog || []);
    posthog.init('phc_Gz8DBv1ZMbOwt3hE8sJZwKGsDl5FtMSkvBNSR0HC07c', { api_host: POSTHOG_INGEST, capture_pageview: false, })


    // LOAD SEGMENT W PROXY
    const ANALYTICS_BASE = `https://app.composio.dev/api/script/`
    !function () {
        var i = "analytics", analytics = window[i] = window[i] || []; if (!analytics.initialize) if (analytics.invoked) window.console && console.error && console.error("Segment snippet included twice."); else {
            analytics.invoked = !0; analytics.methods = ["trackSubmit", "trackClick", "trackLink", "trackForm", "pageview", "identify", "reset", "group", "track", "ready", "alias", "debug", "page", "screen", "once", "off", "on", "addSourceMiddleware", "addIntegrationMiddleware", "setAnonymousId", "addDestinationMiddleware", "register"]; analytics.factory = function (e) { return function () { if (window[i].initialized) return window[i][e].apply(window[i], arguments); var n = Array.prototype.slice.call(arguments); if (["track", "screen", "alias", "group", "page", "identify"].indexOf(e) > -1) { var c = document.querySelector("link[rel='canonical']"); n.push({ __t: "bpc", c: c && c.getAttribute("href") || void 0, p: location.pathname, u: location.href, s: location.search, t: document.title, r: document.referrer }) } n.unshift(e); analytics.push(n); return analytics } }; for (var n = 0; n < analytics.methods.length; n++) { var key = analytics.methods[n]; analytics[key] = analytics.factory(key) } analytics.load = function (key, n) { var t = document.createElement("script"); t.type = "text/javascript"; t.async = !0; t.setAttribute("data-global-segment-analytics-key", i); t.src = ANALYTICS_BASE + "seg_" + key + ".js"; var r = document.getElementsByTagName("script")[0]; r.parentNode.insertBefore(t, r); analytics._loadOptions = n }; analytics._writeKey = "hbf4bfqyIUXHcjwrLRApMM3LMa87uDeh";; analytics.SNIPPET_VERSION = "5.2.0";
            analytics.load("hbf4bfqyIUXHcjwrLRApMM3LMa87uDeh", {
                integrations: {
                    "Segment.io": {
                        apiHost: "composio_s_1.composio.dev/v1",
                        protocol: "https",
                    },
                },
            });

            const IS_DEV = !window?.location?.hostname?.includes("composio.dev");
            analytics.page(null, null, { IS_DEV });
            navigation.addEventListener('navigate', () => {
                analytics.page(null, null, { IS_DEV });
            });

        }
    }();

        // Your existing code...

    // Create a new script element
    const script = document.createElement('script');
    script.src = 'https://opps-widget.getwarmly.com/warmly.js?clientId=a782c02d7f81f1cecd1729551d050774';
    script.id = 'warmly-script-loader';
    script.defer = true;

    // Append the script element to the body
    document.body.appendChild(script);

    console.log("init analytics loaded")
})()



