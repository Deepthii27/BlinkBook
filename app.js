/* ===== Settings: fill these in (see setup steps) ===== */
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
// Supabase needs passwords of 6+ characters, so the real login password is PASSWORD_PREFIX + the passcode people type.
const PASSWORD_PREFIX = "album-";
const MEMBERS = { kee: "kee@trips.example.com", dee: "dee@trips.example.com" };
const BUCKET = "photos";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const view = $("#view"), gate = $("#gate"), appEl = $("#app"), toast = $("#toast");
let tt;
const say = (m, keep) => { clearTimeout(tt); toast.hidden = !m; toast.textContent = m || ""; if (m && !keep) tt = setTimeout(() => say(""), 5000); };

if (SUPABASE_URL.startsWith("YOUR_")) {
  gate.hidden = false;
  $("#gateMsg").textContent = "Setup needed: add your Supabase URL and key in app.js.";
  throw new Error("Supabase is not configured yet");
}
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let me = "", passcode = "";

/* ---------- gate: passcode, then name ---------- */
const wrong = (m) => {
  $("#gateMsg").textContent = m;
  const c = $(".gate-card"); c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake");
};

$("#stepCode").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#gateMsg").textContent = "";
  const code = $("#code").value.trim();
  if (!code) return;
  // Check the passcode on the server by trying a login, then sign straight out again.
  const { error } = await sb.auth.signInWithPassword({ email: Object.values(MEMBERS)[0], password: PASSWORD_PREFIX + code });
  if (error) return wrong(error.status === 400 ? "That passcode isn't right." : "Couldn't connect. Please try again.");
  await sb.auth.signOut();
  passcode = code;
  $("#stepCode").hidden = true; $("#stepName").hidden = false; $("#name").focus();
});

$("#stepName").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#name").value.trim().toLowerCase();
  if (!Object.hasOwn(MEMBERS, name)) return wrong("Sorry, this album is only for Kee and Dee.");
  const { error } = await sb.auth.signInWithPassword({ email: MEMBERS[name], password: PASSWORD_PREFIX + passcode });
  if (error) return wrong("Couldn't open the album. Please start again.");
  passcode = "";
  enter(name);
});

function enter(name) {
  me = name; $("#who").textContent = cap(name);
  gate.hidden = true; appEl.hidden = false; route();
}
function lock() {
  appEl.hidden = true; gate.hidden = false; location.hash = "";
  $("#code").value = ""; $("#name").value = ""; $("#gateMsg").textContent = "";
  $("#stepCode").hidden = false; $("#stepName").hidden = true; $("#code").focus();
}
$("#signout").addEventListener("click", () => sb.auth.signOut());
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT" && !appEl.hidden) lock(); });
sb.auth.getSession().then(({ data }) => {
  const mail = data.session && data.session.user.email;
  const name = Object.keys(MEMBERS).find((k) => MEMBERS[k] === mail);
  if (name) enter(name); else { gate.hidden = false; $("#code").focus(); }
});

/* ---------- helpers ---------- */
const day = (d) => new Date(d + "T00:00").toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
const range = (a, b) => (a && b && a !== b ? `${day(a)} to ${day(b)}` : a ? day(a) : "");
const meta = (t) => [t.place, range(t.start_date, t.end_date)].filter(Boolean).join(", ");
async function sign(paths) {
  if (!paths.length) return {};
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
  return Object.fromEntries((data || []).map((d) => [d.path, d.signedUrl]));
}
async function shrink(file, max = 1800) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.82));
}

/* ---------- routing ---------- */
window.addEventListener("hashchange", route);
function route() {
  if (appEl.hidden) return;
  const m = location.hash.match(/^#\/trip\/([\w-]+)/);
  m ? showTrip(m[1]) : showHome();
}

/* ---------- home: list of trips ---------- */
async function showHome() {
  view.innerHTML = '<p class="muted pad">Loading…</p>';
  const [t, p] = await Promise.all([
    sb.from("trips").select("*").order("start_date", { ascending: false, nullsFirst: false }),
    sb.from("photos").select("trip_id,path").order("created_at"),
  ]);
  if (t.error || p.error) { view.innerHTML = `<p class="empty">Couldn't load trips: ${esc((t.error || p.error).message)}</p>`; return; }
  const first = {}, count = {};
  p.data.forEach((x) => { first[x.trip_id] ??= x.path; count[x.trip_id] = (count[x.trip_id] || 0) + 1; });
  const urls = await sign(Object.values(first));
  view.innerHTML = `<div class="bar"><h1>Our trips</h1><button class="btn" id="newTrip" type="button">New trip</button></div>` +
    (t.data.length
      ? `<div class="trips">${t.data.map((x, i) => `<a class="trip" style="--i:${Math.min(i, 12)}" href="#/trip/${x.id}">${
          first[x.id] ? `<img src="${urls[first[x.id]] || ""}" alt="" loading="lazy">` : '<div class="blank">No photos yet</div>'
        }<h3>${esc(x.title)}</h3><p>${esc(meta(x))}</p><small>${count[x.id] || 0} photos</small></a>`).join("")}</div>`
      : '<p class="empty">No trips yet. Add your first one!</p>');
  $("#newTrip").onclick = () => $("#tripDlg").showModal();
}

$("#tripCancel").onclick = () => $("#tripDlg").close();
$("#tripForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const row = { title: f.get("title").trim(), place: f.get("place").trim() || null, start_date: f.get("start") || null, end_date: f.get("end") || null, created_by: me };
  const { data, error } = await sb.from("trips").insert(row).select().single();
  if (error) return say("Couldn't create the trip: " + error.message);
  e.target.reset(); $("#tripDlg").close(); location.hash = `#/trip/${data.id}`;
});

/* ---------- one trip: photo wall ---------- */
let cur = { id: "", photos: [], urls: {}, i: 0 };
async function showTrip(id) {
  view.innerHTML = '<p class="muted pad">Loading…</p>';
  const [t, p] = await Promise.all([
    sb.from("trips").select("*").eq("id", id).single(),
    sb.from("photos").select("*").eq("trip_id", id).order("created_at"),
  ]);
  if (t.error || p.error) { view.innerHTML = '<p class="empty">Couldn\'t find this trip. <a class="back" href="#/">Back</a></p>'; return; }
  const urls = await sign(p.data.map((x) => x.path));
  cur = { id, photos: p.data, urls, i: 0 };
  view.innerHTML = `<a class="back" href="#/">← All trips</a>
    <div class="bar"><div><h1>${esc(t.data.title)}</h1><p class="muted">${esc(meta(t.data))}</p></div>
    <div class="actions"><label class="btn">Add photos<input id="files" type="file" accept="image/*" multiple hidden></label>
    <button class="ghost" id="delTrip" type="button">Delete trip</button></div></div>` +
    (p.data.length
      ? `<div class="wall">${p.data.map((ph, i) => `<figure class="polaroid" style="--i:${Math.min(i, 12)}" data-i="${i}"><img src="${urls[ph.path] || ""}" alt="${esc(ph.caption || t.data.title)}" loading="lazy"><figcaption>${esc(ph.caption || "")}</figcaption></figure>`).join("")}</div>`
      : '<p class="empty">No photos yet. Tap "Add photos" to start the album.</p>');
  $("#files").onchange = (e) => addPhotos(e.target.files);
  $("#delTrip").onclick = deleteTrip;
  view.querySelectorAll(".polaroid").forEach((f) => (f.onclick = () => openLB(+f.dataset.i)));
}

async function addPhotos(files) {
  const list = [...files]; let ok = 0;
  for (const [i, f] of list.entries()) {
    say(`Uploading ${i + 1} of ${list.length}…`, true);
    try {
      const path = `${cur.id}/${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from(BUCKET).upload(path, await shrink(f), { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const ins = await sb.from("photos").insert({ trip_id: cur.id, path, uploaded_by: me });
      if (ins.error) throw ins.error;
      ok++;
    } catch (err) { console.error(err); }
  }
  say(ok === list.length ? "" : `${ok} of ${list.length} photos uploaded. Some failed.`);
  showTrip(cur.id);
}

async function deleteTrip() {
  if (!confirm("Delete this trip and all its photos? This can't be undone.")) return;
  const paths = cur.photos.map((p) => p.path);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  const { error } = await sb.from("trips").delete().eq("id", cur.id);
  if (error) return say("Couldn't delete: " + error.message);
  location.hash = "#/";
}

/* ---------- full-screen viewer ---------- */
const lb = $("#lb");
function openLB(i) {
  const n = cur.photos.length;
  cur.i = (i + n) % n;
  const ph = cur.photos[cur.i];
  $("#lbImg").src = cur.urls[ph.path] || "";
  $("#lbCap").value = ph.caption || "";
  $("#lbMeta").textContent = `${cur.i + 1} of ${n}` + (ph.uploaded_by ? `, added by ${cap(ph.uploaded_by)}` : "");
  if (!lb.open) lb.showModal();
}
$("#lbPrev").onclick = () => openLB(cur.i - 1);
$("#lbNext").onclick = () => openLB(cur.i + 1);
$("#lbClose").onclick = () => lb.close();
$("#lbCap").addEventListener("change", async () => {
  const ph = cur.photos[cur.i];
  ph.caption = $("#lbCap").value.trim();
  const { error } = await sb.from("photos").update({ caption: ph.caption }).eq("id", ph.id);
  if (error) return say("Couldn't save the caption.");
  const fc = view.querySelectorAll(".polaroid figcaption")[cur.i];
  if (fc) fc.textContent = ph.caption;
});
$("#lbDel").onclick = async () => {
  if (!confirm("Delete this photo?")) return;
  const ph = cur.photos[cur.i];
  await sb.storage.from(BUCKET).remove([ph.path]);
  await sb.from("photos").delete().eq("id", ph.id);
  lb.close(); showTrip(cur.id);
};
lb.addEventListener("keydown", (e) => {
  if (e.target.id === "lbCap") return;
  if (e.key === "ArrowLeft") openLB(cur.i - 1);
  if (e.key === "ArrowRight") openLB(cur.i + 1);
});
let sx = 0;
lb.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
lb.addEventListener("touchend", (e) => {
  const d = e.changedTouches[0].clientX - sx;
  if (Math.abs(d) > 60 && e.target.id !== "lbCap") openLB(cur.i + (d < 0 ? 1 : -1));
});