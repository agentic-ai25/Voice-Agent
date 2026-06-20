/*!
 * Flowstack Chat Widget — self-contained embed for Google Tag Manager / any site.
 *
 * Usage (GTM Custom HTML tag, or a <script> on any page):
 *   <script>window.FlowstackChat = { agentUrl: "https://api.yourdomain.com" };</script>
 *   <script src="https://cdn.yourdomain.com/widget.js" async></script>
 *
 * No framework required. Injects its own CSS + DOM and talks to the agent backend
 * (the FastAPI /chat endpoint). Safe to load once per page.
 */
(function () {
  "use strict";

  // Don't double-inject if GTM fires the tag twice.
  if (window.__flowstackChatLoaded) return;
  window.__flowstackChatLoaded = true;

  // ---- config: from window.FlowstackChat or the script tag's data-agent-url ----
  var cfg = window.FlowstackChat || {};
  var currentScript =
    document.currentScript ||
    (function () {
      var s = document.getElementsByTagName("script");
      return s[s.length - 1];
    })();
  var AGENT_URL =
    cfg.agentUrl ||
    (currentScript && currentScript.getAttribute("data-agent-url")) ||
    "http://localhost:8000";
  AGENT_URL = AGENT_URL.replace(/\/$/, "");

  // ---- visitor id (stable per browser) ----
  var visitorId = localStorage.getItem("fs_visitor_id");
  if (!visitorId) {
    visitorId = "v_" + Math.random().toString(36).slice(2);
    localStorage.setItem("fs_visitor_id", visitorId);
  }

  // ---- styles ----
  var css =
    "#fs-bubble{position:fixed;right:24px;bottom:24px;width:58px;height:58px;border-radius:50%;" +
    "background:#4f46e5;color:#fff;font-size:26px;border:0;cursor:pointer;" +
    "box-shadow:0 8px 24px rgba(79,70,229,.4);z-index:2147483000;display:flex;align-items:center;justify-content:center}" +
    "#fs-panel{position:fixed;right:24px;bottom:94px;width:372px;max-height:72vh;background:#fff;border-radius:16px;" +
    "box-shadow:0 16px 48px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden;z-index:2147483000;" +
    "border:1px solid #e6e8ee;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
    "#fs-panel.fs-open{display:flex}" +
    "#fs-head{background:#4f46e5;color:#fff;padding:14px 18px;font-weight:700;font-size:15px}" +
    "#fs-head small{display:block;font-weight:400;opacity:.85;font-size:12px;margin-top:2px}" +
    "#fs-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}" +
    ".fs-msg{padding:9px 13px;border-radius:13px;max-width:82%;white-space:pre-wrap;font-size:14.5px;line-height:1.5}" +
    ".fs-me{align-self:flex-end;background:#4f46e5;color:#fff}" +
    ".fs-bot{align-self:flex-start;background:#f6f7fb;color:#1e2230}" +
    ".fs-act a{align-self:flex-start;display:inline-block;padding:8px 14px;background:#10b981;color:#fff;" +
    "border-radius:9px;font-size:14px;font-weight:600;text-decoration:none}" +
    "#fs-bar{display:flex;border-top:1px solid #e6e8ee}" +
    "#fs-inp{flex:1;border:0;padding:14px;font:inherit;outline:none}" +
    "#fs-send{border:0;background:#4f46e5;color:#fff;padding:0 20px;cursor:pointer;font-weight:600}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---- DOM ----
  var bubble = document.createElement("button");
  bubble.id = "fs-bubble";
  bubble.setAttribute("aria-label", "Chat");
  bubble.textContent = "💬";

  var panel = document.createElement("div");
  panel.id = "fs-panel";
  panel.innerHTML =
    '<div id="fs-head">Flowstack Assistant<small>Ask anything — I can answer, redirect, or book a demo.</small></div>' +
    '<div id="fs-log"></div>' +
    '<div id="fs-bar"><input id="fs-inp" placeholder="Type a message…" autocomplete="off"/>' +
    '<button id="fs-send">Send</button></div>';

  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  var log = panel.querySelector("#fs-log");
  var input = panel.querySelector("#fs-inp");

  bubble.addEventListener("click", function () {
    panel.classList.toggle("fs-open");
    input.focus();
  });

  function addMsg(text, cls) {
    var d = document.createElement("div");
    d.className = "fs-msg " + cls;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  function handleActions(actions) {
    if (!actions) return;
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (!a.url) continue;
      if (a.action === "redirect") {
        // On the customer's real site, send them to the page.
        window.location.href = a.url;
        return;
      }
      if (a.action === "schedule") {
        // External (Calendly) — render a button; popups can be blocked.
        var wrap = document.createElement("div");
        wrap.className = "fs-act";
        var link = document.createElement("a");
        link.href = a.url;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = a.label || "Pick a time";
        wrap.appendChild(link);
        log.appendChild(wrap);
        log.scrollTop = log.scrollHeight;
      }
    }
  }

  var busy = false;
  function send() {
    var text = input.value.trim();
    if (!text || busy) return;
    input.value = "";
    addMsg(text, "fs-me");
    busy = true;
    var thinking = addMsg("…", "fs-bot");
    fetch(AGENT_URL + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitor_id: visitorId,
        message: text,
        current_url: window.location.href,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        thinking.textContent = data.reply;
        handleActions(data.actions);
      })
      .catch(function () {
        thinking.textContent =
          "Sorry — I couldn't reach the assistant. Please try again.";
      })
      .finally(function () { busy = false; });
  }

  panel.querySelector("#fs-send").addEventListener("click", send);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") send();
  });

  // greeting
  addMsg(
    "Hi! I'm the Flowstack assistant. Ask about pricing, our product, or book a demo.",
    "fs-bot"
  );
})();
