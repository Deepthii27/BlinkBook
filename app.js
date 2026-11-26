/* ===== Gate settings (hashes, so the passcode and names aren't written in plain text) ===== */
const SALT = "kd-album-v1";
const PASS_HASH = "a9875ef60ea904e975ed0d44b7df4af0c2ecb8df6de0aa864fbb8bddd9ec0e27";
const NAME_HASHES = ["e32b5b6c856afa913e8d323249c59540e43beb141c6b0ddfc8ffe777ca444196", "8a7307c4a9287a53f95d64c35b3fcbbe8166f54fea6c39c50836b3db8f13f62f"];

/* ===== The five albums on the third screen. "id" must match the folder name inside photos/ ===== */
const ALBUMS = [
  { id: "mangalore", label: "Mangalore" },
  { id: "stalker-phase", label: "Stalker phase" },
  { id: "tamilnadu", label: "Tamilnadu" },
  { id: "bangalore", label: "Bangalore" },
  { id: "u-and-me", label: "U and Me" },
];

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const view = $("#view"), gate = $("#gate"), appEl = $("#app");

const sha = async (s) => {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
};
const okPass = async (p) => (await sha(`${SALT}:pass:${p}`)) === PASS_HASH;
const okName = async (n) => NAME_HASHES.includes(await sha(`${SALT}:name:${n.trim().toLowerCase()}`));

/* ---------- gate: passcode, then name ---------- */
let passOk = false;
const wrong = (m) => {
  $("#gateMsg").textContent = m;
  const c = $(".gate-card"); c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake");
};

$("#stepCode").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#gateMsg").textContent = "";
  if (!window.crypto || !crypto.subtle) return wrong("Please open this page over https.");
  if (!(await okPass($("#code").value.trim()))) return wrong("That passcode isn't right.");
  passOk = true;
  $("#stepCode").hidden = true; $("#stepName").hidden = false; $("#name").focus();
});

$("#stepName").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#name").value.trim().toLowerCase();
  if (!passOk || !(await okName(name))) return wrong("Sorry, this album is only for Kee and Dee.");
  localStorage.setItem("album-user", name);
  enter(name);
});

let me = "";
async function enter(name) {
  me = name;
  $("#who").textContent = cap(name);
  gate.hidden = true; appEl.hidden = false;
  await loadData();
  route();
}
function lock() {
  localStorage.removeItem("album-user"); passOk = false;
  appEl.hidden = true; gate.hidden = false; location.hash = "";
  $("#code").value = ""; $("#name").value = ""; $("#gateMsg").textContent = "";
  $("#stepCode").hidden = false; $("#stepName").hidden = true; $("#code").focus();
}
$("#signout").addEventListener("click", lock);

(async () => {
  const saved = localStorage.getItem("album-user");
  if (saved && window.crypto && crypto.subtle && (await okName(saved))) return enter(saved);
  gate.hidden = false; $("#code").focus();
})();

/* ---------- data + routing ---------- */
let trips = [], dataErr = false;
async function loadData() {
  try {
    const r = await fetch("trips.json", { cache: "no-cache" });
    dataErr = !r.ok;
    trips = r.ok ? await r.json() : [];
  } catch (e) { trips = []; dataErr = true; }
}
window.addEventListener("hashchange", route);
function route() {
  if (appEl.hidden) return;
  window.scrollTo(0, 0);
  const m = location.hash.match(/^#\/trip\/(.+)$/);
  m ? showTrip(decodeURIComponent(m[1])) : showHome();
}
const sub = (t) => [t.place, t.when].filter(Boolean).join(", ");

function showHome() {
  view.innerHTML = `<div class="bar"><div><h1>Hi ${esc(cap(me))}</h1><p class="muted">Pick a memory to open</p></div></div>
    ${dataErr ? '<p class="msg">The photo list (trips.json) wasn\'t found. Run node build-album.js, or check the Netlify build, then deploy again.</p>' : ""}
    <div class="trips">${ALBUMS.map((a, i) => {
      const t = trips.find((x) => x.id === a.id);
      return `<a class="trip" style="--i:${i}" href="#/trip/${encodeURIComponent(a.id)}">${
        t ? `<img src="${esc(t.cover)}" alt="" loading="lazy">` : '<div class="blank">Coming soon</div>'
      }<h3><span class="num">${i + 1}</span>${esc(a.label)}</h3><small>${t ? t.photos.length + " photos" : "No photos yet"}</small></a>`;
    }).join("")}</div>`;
}

let cur = { photos: [], i: 0 };
function showTrip(id) {
  const a = ALBUMS.find((x) => x.id === id);
  const t = trips.find((x) => x.id === id);
  if (!a) { view.innerHTML = '<p class="empty">Couldn\'t find this album.</p><a class="back" href="#/">← Back to albums</a>'; return; }
  const photos = t ? t.photos : [];
  cur = { photos, i: 0 };
  view.innerHTML = `<a class="back" href="#/">← Back to albums</a><div class="bar"><div><h1>${esc(a.label)}</h1><p class="muted">${esc(t ? sub(t) : "")}</p></div></div>` +
    (photos.length
      ? `<div class="wall">${photos.map((p, i) => `<figure class="polaroid" style="--i:${Math.min(i, 12)}" data-i="${i}"><img src="${esc(p.src)}" alt="${esc(p.caption || a.label)}" loading="lazy"><figcaption>${esc(p.caption)}</figcaption></figure>`).join("")}</div>`
      : '<p class="empty">No photos here yet.</p>');
  view.querySelectorAll(".polaroid").forEach((f) => (f.onclick = () => openLB(+f.dataset.i)));
}

/* ---------- full-screen viewer ---------- */
const lb = $("#lb");
function openLB(i) {
  const n = cur.photos.length;
  cur.i = (i + n) % n;
  const p = cur.photos[cur.i];
  $("#lbImg").src = p.src; $("#lbImg").alt = p.caption || "";
  $("#lbCap").textContent = p.caption;
  $("#lbMeta").textContent = `${cur.i + 1} of ${n}`;
  if (!lb.open) lb.showModal();
}
$("#lbPrev").onclick = () => openLB(cur.i - 1);
$("#lbNext").onclick = () => openLB(cur.i + 1);
$("#lbClose").onclick = () => lb.close();
lb.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") openLB(cur.i - 1);
  if (e.key === "ArrowRight") openLB(cur.i + 1);
});
let sx = 0;
lb.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
lb.addEventListener("touchend", (e) => {
  const d = e.changedTouches[0].clientX - sx;
  if (Math.abs(d) > 60) openLB(cur.i + (d < 0 ? 1 : -1));
});