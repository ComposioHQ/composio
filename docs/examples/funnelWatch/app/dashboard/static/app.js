const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const getJSON = (url) => fetch(url).then((r) => r.json());
const send = (url, method = "POST", body) =>
  fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

const fmtMoney = (n) => "$" + (n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const clock = (ts) => (ts || "").slice(11, 16);
const escText = (s) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// ---------- STATS ----------
async function renderStats() {
  const m = await getJSON("/api/overview");
  const fr = m.failed_rate_pct || 0;
  const stats = [
    { label: "New MRR", value: fmtMoney(m.new_mrr), cls: "" },
    { label: "Signups", value: (m.signups || 0).toLocaleString(), cls: "" },
    { label: "Trial → Paid", value: (m.trial_conv_pct || 0) + "%", cls: "sm" },
    { label: "Activation", value: (m.activation_rate_pct || 0) + "%", cls: "sm" },
    { label: "Failed Rate", value: fr + "%", cls: "sm " + (fr >= 5 ? "bad" : "good") },
  ];
  $("#stats").innerHTML = stats
    .map((s) => `<div class="stat">
      <div class="label">${s.label}</div>
      <div class="value ${s.cls}">${s.value}</div>
    </div>`)
    .join("");
}

async function renderSourceHealth() {
  const d = await getJSON("/api/source-health");
  const rows = d.sources || [];
  $("#source-health").innerHTML = rows.map((s) => `
    <div class="source-pill ${s.status}">
      <span class="dot ${s.status === "live" ? "on" : ""}"></span>
      <div>
        <div class="source-name">${s.name}</div>
        <div class="source-meta">${(s.events || 0).toLocaleString()} events${s.last_event_at ? " · " + clock(s.last_event_at) : ""}</div>
      </div>
    </div>
  `).join("");
}

// ---------- CHARTS ----------
// rows: [{ label, display, ratio }]  ratio in 0..1
function renderBars(el, rows) {
  el.innerHTML = rows.length
    ? rows.map((r) => `<div class="bar-row">
        <div class="name">${r.label}</div>
        <div class="track"><div class="fill" style="width:${Math.round(r.ratio * 100)}%"></div></div>
        <div class="num">${r.display}</div>
      </div>`).join("")
    : '<p class="empty">No data yet.</p>';
}

async function renderCharts() {
  const [plans, funnel, clicks, m] = await Promise.all([
    getJSON("/api/plans"), getJSON("/api/funnel"), getJSON("/api/clicks"), getJSON("/api/overview"),
  ]);

  // acquisition funnel (Visits → Signups → Activations → Paid)
  const stages = funnel.stages || [];
  const maxStage = Math.max(1, ...stages.map((s) => s.count));
  renderBars($("#bars-funnel"), stages.map((s) => ({
    label: s.conv_pct != null ? `${s.name} · ${s.conv_pct}%` : s.name,
    display: (s.count || 0).toLocaleString(),
    ratio: s.count / maxStage,
  })));

  // top button clicks (instrumented CTAs)
  const els = clicks.elements || [];
  const maxClick = Math.max(1, ...els.map((e) => e.clicks));
  renderBars($("#bars-clicks"), els.slice(0, 5).map((e) => ({
    label: e.name,
    display: (e.clicks || 0).toLocaleString(),
    ratio: e.clicks / maxClick,
  })));

  // new MRR by plan
  const pl = plans.plans || [];
  const maxMrr = Math.max(1, ...pl.map((p) => p.new_mrr_cents));
  renderBars($("#bars-mrr"), pl.map((p) => ({
    label: plans.leader === p.plan ? `${p.plan} ·` : p.plan,
    display: "$" + p.new_mrr.toLocaleString(),
    ratio: p.new_mrr_cents / maxMrr,
  })));

  // billing movements stacked bar
  const news = m.new_subscriptions || 0, churned = m.churned || 0, failed = m.failed_payments || 0;
  const total = Math.max(1, news + churned + failed);
  $("#statusbar").innerHTML = [
    ["paid", news], ["refunded", churned], ["failed", failed],
  ].map(([k, v]) => `<span class="seg-${k}" style="width:${(v / total) * 100}%"></span>`).join("");
  $("#status-legend").innerHTML = [
    ["good", "New", news], ["warn", "Churned", churned], ["bad", "Failed", failed],
  ].map(([c, l, v]) => `<span><i style="background:var(--${c})"></i>${l} ${v}</span>`).join("");
}

async function renderSourcePerformance() {
  const d = await getJSON("/api/source-performance");
  const rows = (d.sources || []).slice(0, 6);
  $("#source-performance").innerHTML = rows.length ? `
    <div class="source-head"><span>Source</span><span>Leads</span><span>Paid</span><span>MRR</span></div>
    ${rows.map((r) => `
      <div class="source-row">
        <span>${escText(r.source)}</span>
        <span>${r.leads || 0}${delta(r.leads_delta_pct)}</span>
        <span>${r.new_subscriptions || 0}${delta(r.new_subscriptions_delta_pct)}</span>
        <span>${fmtMoney(r.new_mrr)}${delta(r.new_mrr_delta_pct)}</span>
      </div>
    `).join("")}
  ` : '<p class="empty">No source data yet.</p>';
}

function delta(v) {
  if (v == null) return "";
  const cls = v >= 0 ? "up" : "down";
  const sign = v > 0 ? "+" : "";
  return ` <em class="${cls}">${sign}${v}%</em>`;
}

// ---------- SLACK FEED (insights + alerts, mirrored from Slack) ----------
// Every insight/alert FunnelWatch posts to Slack shows here. Conversational Q&A
// (kind "message" — bot replies, startup notices) stays on Slack only.
function renderFeedItem(o) {
  const sev = (o.severity || "").toLowerCase();
  const isAlert = o.kind === "alert" || sev === "high" || sev === "critical" || /anomaly|alert/i.test(o.title || "");
  const meta = [o.severity, o.source, o.type && o.type.replaceAll("_", " ")].filter(Boolean).join(" · ");
  const ev = o.evidence || {};
  return `<div class="rec insight${isAlert ? " alert" : ""}">
    <div class="rec-head">
      <span class="title">${escText(o.title)}</span>
      <span class="when">${clock(o.ts)}</span>
    </div>
    <div class="body">${md(o.text)}</div>
    ${meta ? `<div class="meta">${escText(meta)}</div>` : ""}
    ${ev.lead_delta_pct != null ? `<div class="evidence">Leads ${ev.today_leads} vs ${ev.baseline_leads} baseline · Paid ${ev.today_paid} vs ${ev.baseline_paid}</div>` : ""}
  </div>`;
}

const BROADCAST_KINDS = new Set(["insight", "alert", "monitor"]);
async function renderSlackFeed() {
  const d = await getJSON("/api/recommendations");
  const items = (d.outbox || []).filter((o) => BROADCAST_KINDS.has(o.kind));
  $("#slack-feed").innerHTML = items.length
    ? items.map(renderFeedItem).join("")
    : '<p class="empty">No Slack activity yet. Insights and alerts post here as they fire.</p>';
}

// ---------- SETTINGS MODAL ----------
async function renderMonitors() {
  const d = await getJSON("/api/monitors");
  $("#monitor-list").innerHTML = (d.monitors || [])
    .map((m) => `<li>
      <div>
        <div class="mname">${m.name}</div>
        <div class="mq">${m.question}</div>
        <span class="freq">${m.frequency}${m.threshold != null ? " · " + m.threshold + "%" : ""}</span>
      </div>
      <div class="row-actions">
        <input type="checkbox" class="m-toggle" data-id="${m.id}" ${m.enabled ? "checked" : ""} />
        <button class="del" data-del="${m.id}">delete</button>
      </div>
    </li>`)
    .join("");
  $$(".m-toggle").forEach((c) =>
    c.addEventListener("change", () => send(`/api/monitors/${c.dataset.id}`, "PATCH", { enabled: c.checked }))
  );
  $$("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      await send(`/api/monitors/${b.dataset.del}`, "DELETE", null);
      renderMonitors();
    })
  );
}

async function renderIntegrations() {
  const d = await getJSON("/api/integrations");
  $("#integration-list").innerHTML = (d.integrations || [])
    .map((it) => `<li>
      <div>
        <div class="iname"><span class="dot ${it.connected ? "on" : ""}"></span>${it.name}</div>
        <div class="ipurpose">${it.purpose}</div>
      </div>
      <button class="conn-btn ${it.connected ? "on" : ""}" data-key="${it.key}" data-conn="${it.connected}">
        ${it.connected ? "Disconnect" : "Connect"}
      </button>
    </li>`)
    .join("");
  $$(".conn-btn").forEach((b) =>
    b.addEventListener("click", async () => {
      await send(`/api/integrations/${b.dataset.key}`, "PATCH", { connected: b.dataset.conn !== "true" });
      renderIntegrations();
    })
  );
}

function openModal() {
  $("#modal").hidden = false;
  renderMonitors();
  renderIntegrations();
}
const closeModal = () => ($("#modal").hidden = true);

// ---------- WIRING ----------
function renderDashboard() {
  renderStats();
  renderSourceHealth();
  renderCharts();
  renderSourcePerformance();
  renderSlackFeed();
}

// ---------- CHAT ----------
const esc = (s) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
// minimal markdown: **bold** + line breaks (the live agent answers in markdown)
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
const thread = () => $("#chat-thread");

function addMsg(role, html, thinking = false) {
  const el = document.createElement("div");
  el.className = `msg ${role}${thinking ? " thinking" : ""}`;
  el.innerHTML = `<div class="bubble">${html}</div>`;
  thread().appendChild(el);
  thread().scrollTop = thread().scrollHeight;
  return el;
}

async function sendChat(message) {
  addMsg("user", esc(message));
  const pending = addMsg("agent", "Thinking…", true);
  const glow = document.querySelector(".glow");
  glow?.classList.add("thinking");
  try {
    const d = await send("/api/chat", "POST", { message });
    pending.classList.remove("thinking");
    pending.querySelector(".bubble").innerHTML = md(d.reply);
  } catch {
    pending.classList.remove("thinking");
    pending.querySelector(".bubble").textContent = "Something went wrong.";
  } finally {
    glow?.classList.remove("thinking");
  }
  thread().scrollTop = thread().scrollHeight;
}

$("#chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#chat-text").value.trim();
  if (!v) return;
  $("#chat-text").value = "";
  sendChat(v);
});
addMsg("agent", "Ask me about today's funnel, MRR, churn, plans, or conversion rates.");

$("#settings-btn").addEventListener("click", openModal);
$("#modal-close").addEventListener("click", closeModal);
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

$("#refresh-btn").addEventListener("click", async () => {
  await send("/api/refresh");
  renderDashboard();
});
$("#rollover-btn").addEventListener("click", async () => {
  await send("/api/run-daily");
  renderDashboard();
});
$("#monitor-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#monitor-form [name=question]").value.trim();
  if (!q) return;
  await send("/api/monitors", "POST", { question: q });
  e.target.reset();
  renderMonitors();
});

renderDashboard();
setInterval(renderDashboard, 5000);
