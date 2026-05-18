(() => {
  "use strict";

  const STORAGE_KEYS = {
    users: "onb_users_v1",
    notices: "onb_notices_v1",
    activity: "onb_activity_v1",
    session: "onb_session_v1",
  };

  const ROLES = {
    Admin: "Admin",
    Faculty: "Faculty",
    Student: "Student",
  };

  const CATEGORY_PRESETS = [
    "Academics",
    "Events",
    "Exams",
    "Placements",
    "Admissions",
    "Clubs",
    "General",
  ];

  const $ = (sel) => document.querySelector(sel);
  const escapeHtml = (str) =>
    String(str).replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[m],
    );

  const state = {
    currentUser: null,
    users: [],
    notices: [],
    activity: [],
    ui: {
      searchQuery: "",
      categoryFilter: "all",
      sortOrder: "newest",
    },
    modal: {
      mode: "create", // create | edit
      noticeId: "",
      attachments: [], // { id, kind, url, name, mime }
    },
  };

  const storage = {
    read(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
  };

  const uid = () =>
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

  function roleRank(role) {
    if (role === ROLES.Admin) return 3;
    if (role === ROLES.Faculty) return 2;
    return 1;
  }

  function canManageNotices(user) {
    return user && roleRank(user.role) >= roleRank(ROLES.Faculty);
  }

  function canManageUsers(user) {
    return user && user.role === ROLES.Admin;
  }

  function getCurrentUserIdFromSession() {
    const session = storage.read(STORAGE_KEYS.session, null);
    return session && session.userId ? session.userId : null;
  }

  function setSessionUserId(userId) {
    storage.write(STORAGE_KEYS.session, {
      userId,
      setAt: new Date().toISOString(),
    });
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEYS.session);
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(iso);
    }
  }

  function showToast(message) {
    const toast = $("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toast.classList.add("hidden"), 2500);
  }

  function seedDefaultsIfNeeded() {
    const users = storage.read(STORAGE_KEYS.users, []);
    const notices = storage.read(STORAGE_KEYS.notices, []);

    if (!Array.isArray(users) || users.length === 0) {
      const now = new Date().toISOString();
      const seededUsers = [
        {
          id: uid(),
          username: "admin",
          password: "Admin123",
          role: ROLES.Admin,
          createdAt: now,
        },
        {
          id: uid(),
          username: "faculty",
          password: "Faculty123",
          role: ROLES.Faculty,
          createdAt: now,
        },
        {
          id: uid(),
          username: "student",
          password: "Student123",
          role: ROLES.Student,
          createdAt: now,
        },
      ];
      storage.write(STORAGE_KEYS.users, seededUsers);
    }

    if (!Array.isArray(notices) || notices.length === 0) {
      const seededNotices = [
        {
          id: uid(),
          title: "Welcome to the new semester",
          description:
            "Classes have started. Please check your timetable in the student portal.",
          category: "Academics",
          attachments: [],
          dateCreated: new Date(
            Date.now() - 1000 * 60 * 60 * 24 * 2,
          ).toISOString(),
          createdBy: "", // populated later (optional)
          updatedAt: null,
        },
        {
          id: uid(),
          title: "Campus placement drive",
          description:
            "Eligible final-year students should register before Friday. Documents are required during verification.",
          category: "Placements",
          attachments: [],
          dateCreated: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
          createdBy: "",
          updatedAt: null,
        },
      ];
      storage.write(STORAGE_KEYS.notices, seededNotices);
    }

    if (!Array.isArray(storage.read(STORAGE_KEYS.activity, []))) {
      storage.write(STORAGE_KEYS.activity, []);
    }
  }

  function loadAllData() {
    state.users = storage.read(STORAGE_KEYS.users, []);
    state.notices = storage.read(STORAGE_KEYS.notices, []);
    state.activity = storage.read(STORAGE_KEYS.activity, []);

    if (!Array.isArray(state.users)) state.users = [];
    if (!Array.isArray(state.notices)) state.notices = [];
    if (!Array.isArray(state.activity)) state.activity = [];

    const userId = getCurrentUserIdFromSession();
    state.currentUser = userId
      ? state.users.find((u) => u.id === userId) || null
      : null;
  }

  function logActivity({ type, userId, noticeId, meta }) {
    const entry = {
      id: uid(),
      ts: new Date().toISOString(),
      type,
      userId: userId || "",
      noticeId: noticeId || "",
      meta: meta || {},
    };
    state.activity.unshift(entry);
    state.activity = state.activity.slice(0, 100);
    storage.write(STORAGE_KEYS.activity, state.activity);
  }

  function setView(view) {
    const views = ["viewLogin", "viewNotices", "viewDashboard"];
    for (const id of views) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.classList.add("hidden");
    }
    const target = document.getElementById(view);
    if (target) target.classList.remove("hidden");
  }

  function updateNav() {
    const loginBtn = $("#navLogin");
    const noticesBtn = $("#navNotices");
    const dashboardBtn = $("#navDashboard");
    const logoutBtn = $("#navLogout");
    const userBadge = $("#userBadge");
    const newNoticeBtn = $("#btnNewNotice");

    const user = state.currentUser;
    const loggedIn = !!user;

    loginBtn.disabled = loggedIn;
    noticesBtn.disabled = !loggedIn;
    logoutBtn.disabled = !loggedIn;

    const isAdmin = canManageUsers(user);
    dashboardBtn.disabled = !isAdmin;

    if (userBadge) {
      const roleChip = user ? `${escapeHtml(user.role)}` : "";
      userBadge.innerHTML = loggedIn
        ? `Signed in as: <span>${roleChip}</span>`
        : "";
    }

    if (newNoticeBtn) {
      newNoticeBtn.disabled = !canManageNotices(user);
    }
  }

  function syncCategoriesToDatalist() {
    const dl = $("#categoryDatalist");
    if (!dl) return;

    const unique = new Set(CATEGORY_PRESETS);
    for (const n of state.notices) {
      if (n && n.category) unique.add(n.category);
    }

    dl.innerHTML = "";
    for (const cat of Array.from(unique).sort((a, b) => a.localeCompare(b))) {
      const opt = document.createElement("option");
      opt.value = cat;
      dl.appendChild(opt);
    }

    const select = $("#categoryFilter");
    if (select) {
      const prev = select.value || "all";
      const cats = Array.from(unique);
      select.innerHTML =
        `<option value="all">All categories</option>` +
        cats
          .map(
            (c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`,
          )
          .join("");
      select.value = cats.includes(prev) ? prev : "all";
    }
  }

  function filterNotices() {
    const q = state.ui.searchQuery.trim().toLowerCase();
    const category = state.ui.categoryFilter;
    const sortOrder = state.ui.sortOrder;

    let results = [...state.notices];

    if (category && category !== "all") {
      results = results.filter((n) => String(n.category || "") === category);
    }

    if (q) {
      results = results.filter((n) => {
        const hay =
          `${n.title || ""} ${n.description || ""} ${n.category || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    results.sort((a, b) => {
      const ad = new Date(a.dateCreated || 0).getTime();
      const bd = new Date(b.dateCreated || 0).getTime();
      return sortOrder === "oldest" ? ad - bd : bd - ad;
    });

    return results;
  }

  function inferKindFromUrl(url) {
    const lower = String(url || "").toLowerCase();
    const ext = lower.split("?")[0].split("#")[0].split(".").pop() || "";
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext))
      return { kind: "image" };
    if (ext === "pdf") return { kind: "pdf" };
    if (["mp4", "webm", "ogg"].includes(ext)) return { kind: "video" };
    return { kind: "link" };
  }

  function inferKindFromMime(mime, name) {
    const m = String(mime || "").toLowerCase();
    const lowerName = String(name || "").toLowerCase();
    if (m.startsWith("image/")) return { kind: "image" };
    if (m === "application/pdf") return { kind: "pdf" };
    if (m.startsWith("video/")) return { kind: "video" };
    if (lowerName.endsWith(".pdf")) return { kind: "pdf" };
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lowerName))
      return { kind: "image" };
    if (/\.(mp4|webm|ogg)$/.test(lowerName)) return { kind: "video" };
    return { kind: "link" };
  }

  function renderAttachmentInCard(att) {
    const wrap = document.createElement("div");
    wrap.className = "chip";
    wrap.style.borderRadius = "12px";
    wrap.style.padding = "7px 10px";
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";

    if (att.kind === "image") {
      const img = document.createElement("img");
      img.alt = att.name || "image";
      img.src = att.url;
      img.style.width = "40px";
      img.style.height = "32px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "8px";
      wrap.appendChild(img);
      const s = document.createElement("span");
      s.textContent = att.name || "Image";
      s.style.color = "var(--muted)";
      s.style.fontSize = "12px";
      wrap.appendChild(s);
      return wrap;
    }

    if (att.kind === "video") {
      const video = document.createElement("video");
      video.src = att.url;
      video.controls = false;
      video.muted = true;
      video.playsInline = true;
      video.style.width = "40px";
      video.style.height = "32px";
      video.style.borderRadius = "8px";
      wrap.appendChild(video);
      const s = document.createElement("span");
      s.textContent = att.name || "Video";
      s.style.color = "var(--muted)";
      s.style.fontSize = "12px";
      wrap.appendChild(s);
      return wrap;
    }

    if (att.kind === "pdf") {
      const link = document.createElement("a");
      link.href = att.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = att.name || "PDF";
      link.style.color = "rgba(232, 238, 252, 0.88)";
      link.style.textDecoration = "none";
      wrap.appendChild(link);
      return wrap;
    }

    const link = document.createElement("a");
    link.href = att.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = att.name || "Attachment";
    link.style.color = "rgba(232, 238, 252, 0.88)";
    link.style.textDecoration = "none";
    wrap.appendChild(link);
    return wrap;
  }

  function renderNotices() {
    syncCategoriesToDatalist();

    const list = $("#noticeList");
    const empty = $("#noticeEmpty");
    const resultsMeta = $("#resultsMeta");
    if (!list) return;

    const results = filterNotices();
    list.innerHTML = "";

    if (resultsMeta)
      resultsMeta.textContent = `${results.length} result${results.length === 1 ? "" : "s"}`;

    if (results.length === 0) {
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");

    const user = state.currentUser;
    const allowManage = canManageNotices(user);

    for (const n of results) {
      const card = document.createElement("article");
      card.className = "notice-card";

      const atts = Array.isArray(n.attachments) ? n.attachments : [];
      const showCount = 3;
      const shown = atts.slice(0, showCount);
      const rest = atts.length - shown.length;

      const actionsHtml = allowManage
        ? `
          <div class="notice-actions">
            <button type="button" class="btn" data-action="edit" data-id="${escapeHtml(n.id)}">Edit</button>
            <button type="button" class="btn danger" data-action="delete" data-id="${escapeHtml(n.id)}">Delete</button>
          </div>`
        : "";

      card.innerHTML = `
        <div class="notice-title">${escapeHtml(n.title || "")}</div>
        <div class="chip-row">
          <span class="chip category">${escapeHtml(n.category || "Uncategorized")}</span>
        </div>
        <div class="notice-desc">${escapeHtml(n.description || "")}</div>
        <div class="notice-meta">
          <div class="notice-date">📅 ${escapeHtml(formatDate(n.dateCreated))}</div>
          ${actionsHtml}
        </div>
      `;

      if (atts.length > 0) {
        const attachRow = document.createElement("div");
        attachRow.className = "chip-row";
        shown.forEach((att) =>
          attachRow.appendChild(renderAttachmentInCard(att)),
        );
        if (rest > 0) {
          const more = document.createElement("span");
          more.className = "chip";
          more.textContent = `+${rest} more`;
          attachRow.appendChild(more);
        }
        // insert after chip-row
        card.insertBefore(attachRow, card.querySelector(".notice-desc"));
      }

      list.appendChild(card);

      const editBtn = card.querySelector('[data-action="edit"]');
      const deleteBtn = card.querySelector('[data-action="delete"]');
      if (editBtn) {
        editBtn.addEventListener("click", () => openModal("edit", n));
      }
      if (deleteBtn) {
        deleteBtn.addEventListener("click", () => {
          const ok = window.confirm(`Delete notice: "${n.title}"?`);
          if (!ok) return;
          deleteNotice(n.id);
        });
      }
    }
  }

  function resetModalState() {
    state.modal.mode = "create";
    state.modal.noticeId = "";
    state.modal.attachments = [];
  }

  function closeModal() {
    const overlay = $("#modalOverlay");
    if (overlay) overlay.classList.add("hidden");
    resetModalState();
    const form = $("#noticeForm");
    if (form) form.reset();

    const title = $("#noticeTitle");
    const desc = $("#noticeDescription");
    const cat = $("#noticeCategory");
    if (title) title.value = "";
    if (desc) desc.value = "";
    if (cat) cat.value = "";

    $("#existingAttachments").innerHTML = "";
    $("#noticeFormMode").value = "create";
    $("#noticeFormId").value = "";
  }

  function openModal(mode, notice) {
    const overlay = $("#modalOverlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");

    const title = $("#noticeTitle");
    const desc = $("#noticeDescription");
    const cat = $("#noticeCategory");
    const modalTitle = $("#noticeModalTitle");

    resetModalState();
    $("#noticeFormMode").value = mode;

    if (mode === "create") {
      if (modalTitle) modalTitle.textContent = "Create Notice";
      if (title) title.value = "";
      if (desc) desc.value = "";
      if (cat) cat.value = "";
      $("#noticeFormId").value = "";
      state.modal.attachments = [];
      $("#existingAttachments").innerHTML = "";
      return;
    }

    if (mode === "edit" && notice) {
      if (modalTitle) modalTitle.textContent = "Edit Notice";
      if (title) title.value = notice.title || "";
      if (desc) desc.value = notice.description || "";
      if (cat) cat.value = notice.category || "";
      $("#noticeFormId").value = notice.id;
      state.modal.mode = "edit";
      state.modal.noticeId = notice.id;
      state.modal.attachments = Array.isArray(notice.attachments)
        ? [...notice.attachments]
        : [];
      renderModalAttachments();
    }
  }

  function renderModalAttachments() {
    const wrap = $("#existingAttachments");
    if (!wrap) return;
    wrap.innerHTML = "";

    for (const att of state.modal.attachments) {
      const pill = document.createElement("div");
      pill.className = "attachment-pill";

      const label = document.createElement("span");
      label.textContent = att.name || att.kind || "Attachment";
      pill.appendChild(label);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "×";
      btn.setAttribute("aria-label", `Remove ${att.name || "attachment"}`);
      btn.addEventListener("click", () => {
        state.modal.attachments = state.modal.attachments.filter(
          (x) => x.id !== att.id,
        );
        renderModalAttachments();
      });
      pill.appendChild(btn);
      wrap.appendChild(pill);
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
  }

  function buildAttachmentFromFile(file, dataUrl) {
    const inferred = inferKindFromMime(file.type, file.name);
    return {
      id: uid(),
      kind: inferred.kind,
      url: dataUrl,
      name: file.name || `${inferred.kind.toUpperCase()} file`,
      mime: file.type || "",
    };
  }

  function buildAttachmentFromUrl(url) {
    const inferred = inferKindFromUrl(url);
    const name =
      url.split("?")[0].split("#")[0].split("/").pop() || inferred.kind;
    return {
      id: uid(),
      kind: inferred.kind,
      url: url,
      name,
      mime: "",
    };
  }

  async function addAttachmentsFromFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const max = 8;
    const room = Math.max(0, max - state.modal.attachments.length);
    const limited = files.slice(0, room);

    const readDataUrls = await Promise.all(
      limited.map(async (f) => {
        const dataUrl = await fileToDataUrl(f);
        return buildAttachmentFromFile(f, dataUrl);
      }),
    );
    state.modal.attachments = state.modal.attachments.concat(readDataUrls);
    renderModalAttachments();
    if (files.length > limited.length)
      showToast("Attachment limit reached (stored locally).");
  }

  function addAttachmentUrl(url) {
    const trimmed = String(url || "").trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed) && !/^data:/i.test(trimmed)) {
      showToast("Please enter a valid http(s) URL.");
      return;
    }
    if (state.modal.attachments.length >= 8) {
      showToast("Attachment limit reached.");
      return;
    }
    state.modal.attachments.push(buildAttachmentFromUrl(trimmed));
    renderModalAttachments();
  }

  function createOrUpdateNoticeFromForm() {
    const mode = $("#noticeFormMode").value || "create";
    const id = $("#noticeFormId").value || "";

    const title = ($("#noticeTitle").value || "").trim();
    const description = ($("#noticeDescription").value || "").trim();
    const category = ($("#noticeCategory").value || "").trim();

    if (!title) return { ok: false, error: "Title is required." };
    if (!description) return { ok: false, error: "Description is required." };
    if (!category) return { ok: false, error: "Category is required." };

    const attachments = Array.isArray(state.modal.attachments)
      ? [...state.modal.attachments]
      : [];

    const now = new Date();
    if (mode === "create") {
      return {
        ok: true,
        notice: {
          id: uid(),
          title,
          description,
          category,
          attachments,
          dateCreated: now.toISOString(),
          createdBy: state.currentUser ? state.currentUser.id : "",
          updatedAt: null,
        },
      };
    }

    if (mode === "edit") {
      return {
        ok: true,
        notice: {
          id,
          title,
          description,
          category,
          attachments,
          updatedAt: now.toISOString(),
        },
      };
    }

    return { ok: false, error: "Invalid form mode." };
  }

  function persistNotices() {
    storage.write(STORAGE_KEYS.notices, state.notices);
  }

  function createNotice(notice) {
    state.notices.unshift(notice);
    persistNotices();
  }

  function updateNotice(partialNotice) {
    const idx = state.notices.findIndex((n) => n.id === partialNotice.id);
    if (idx < 0) return;
    const existing = state.notices[idx];
    state.notices[idx] = {
      ...existing,
      ...partialNotice,
      dateCreated: existing.dateCreated, // keep original dateCreated
    };
    persistNotices();
  }

  function deleteNotice(noticeId) {
    const existing = state.notices.find((n) => n.id === noticeId);
    state.notices = state.notices.filter((n) => n.id !== noticeId);
    persistNotices();
    logActivity({
      type: "NOTICE_DELETE",
      userId: state.currentUser ? state.currentUser.id : "",
      noticeId,
      meta: { title: existing ? existing.title : "Deleted notice" },
    });
    renderNotices();
    updateDashboardIfNeeded();
    showToast("Notice deleted.");
  }

  function updateDashboardIfNeeded() {
    if (location.hash !== "#dashboard" && location.hash !== "#users") return;
    renderDashboard();
  }

  function renderDashboard() {
    const dash = $("#viewDashboard");
    if (!dash) return;

    $("#statTotalNotices").textContent = String(state.notices.length);
    $("#statTotalUsers").textContent = String(state.users.length);
    $("#statRole").textContent = state.currentUser
      ? state.currentUser.role
      : "—";

    const isAdmin = canManageUsers(state.currentUser);
    const adminUserPanel = $("#adminUserPanel");
    if (adminUserPanel) adminUserPanel.classList.toggle("hidden", !isAdmin);

    const activityList = $("#activityList");
    const activityEmpty = $("#activityEmpty");

    const userMap = new Map(state.users.map((u) => [u.id, u.username]));
    const noticeMap = new Map(state.notices.map((n) => [n.id, n.title]));

    const activityItems = Array.isArray(state.activity)
      ? state.activity.slice(0, 12)
      : [];

    if (activityList) activityList.innerHTML = "";

    if (activityItems.length === 0) {
      if (activityEmpty) activityEmpty.classList.remove("hidden");
      return;
    }
    if (activityEmpty) activityEmpty.classList.add("hidden");

    for (const a of activityItems) {
      const li = document.createElement("li");
      li.className = "activity-item";

      const actor = userMap.get(a.userId) || "Unknown user";
      const noticeTitle = a.noticeId ? noticeMap.get(a.noticeId) : "";

      let text = "";
      if (a.type === "NOTICE_CREATE")
        text = `${actor} created notice "${noticeTitle || a.meta?.title || "Untitled"}"`;
      else if (a.type === "NOTICE_UPDATE")
        text = `${actor} updated notice "${noticeTitle || a.meta?.title || "Untitled"}"`;
      else if (a.type === "NOTICE_DELETE")
        text = `${actor} deleted notice "${a.meta?.title || noticeTitle || "Untitled"}"`;
      else if (a.type === "USER_ADD")
        text = `${actor} added a new user "${a.meta?.username || ""}"`;
      else if (a.type === "USER_ROLE_UPDATE")
        text = `${actor} changed role for "${a.meta?.username || ""}"`;
      else if (a.type === "USER_REMOVE")
        text = `${actor} removed user "${a.meta?.username || ""}"`;
      else if (a.type === "AUTH_LOGIN") text = `${actor} logged in`;
      else if (a.type === "AUTH_LOGOUT") text = `${actor} logged out`;
      else text = `${actor} performed an action`;

      li.innerHTML = `
        <p class="activity-text">${escapeHtml(text)}</p>
        <span class="activity-time">${escapeHtml(formatDate(a.ts))}</span>
      `;
      if (activityList) activityList.appendChild(li);
    }
  }

  function renderUsersTable() {
    const body = $("#usersTableBody");
    if (!body) return;
    body.innerHTML = "";

    const canAdmin = canManageUsers(state.currentUser);
    if (!canAdmin) return;

    for (const u of state.users
      .slice()
      .sort((a, b) => a.username.localeCompare(b.username))) {
      const tr = document.createElement("tr");

      const roleOptions = [ROLES.Admin, ROLES.Faculty, ROLES.Student]
        .map(
          (r) =>
            `<option value="${escapeHtml(r)}" ${u.role === r ? "selected" : ""}>${escapeHtml(r)}</option>`,
        )
        .join("");

      tr.innerHTML = `
        <td>${escapeHtml(u.username)}</td>
        <td>
          <select data-userid="${escapeHtml(u.id)}" aria-label="Role for ${escapeHtml(u.username)}">
            ${roleOptions}
          </select>
        </td>
        <td class="right">
          <div style="display:flex; gap:8px; justify-content:flex-end; align-items:center;">
            <button type="button" class="btn" data-action="update-role" data-userid="${escapeHtml(u.id)}">Update</button>
            <button type="button" class="btn danger" data-action="remove-user" data-userid="${escapeHtml(u.id)}" ${u.id === state.currentUser.id ? "disabled" : ""}>Remove</button>
          </div>
        </td>
      `;

      body.appendChild(tr);
    }
  }

  function changeUserRole(userId, newRole) {
    if (!canManageUsers(state.currentUser)) return;
    if (![ROLES.Admin, ROLES.Faculty, ROLES.Student].includes(newRole)) return;
    const idx = state.users.findIndex((u) => u.id === userId);
    if (idx < 0) return;
    if (state.users[idx].role === newRole) return;

    const oldRole = state.users[idx].role;
    state.users[idx].role = newRole;
    storage.write(STORAGE_KEYS.users, state.users);

    logActivity({
      type: "USER_ROLE_UPDATE",
      userId: state.currentUser ? state.currentUser.id : "",
      meta: { username: state.users[idx].username, from: oldRole, to: newRole },
    });

    renderUsersTable();
    renderDashboard();
    showToast("User role updated.");
  }

  function removeUser(userId) {
    if (!canManageUsers(state.currentUser)) return;
    if (userId === state.currentUser.id) {
      showToast("You cannot remove your own account.");
      return;
    }
    const user = state.users.find((u) => u.id === userId);
    if (!user) return;

    const ok = window.confirm(`Remove user "${user.username}"?`);
    if (!ok) return;

    state.users = state.users.filter((u) => u.id !== userId);
    storage.write(STORAGE_KEYS.users, state.users);

    // If any session is active for that user, clear it.
    const sessionUserId = getCurrentUserIdFromSession();
    if (sessionUserId === userId) clearSession();

    logActivity({
      type: "USER_REMOVE",
      userId: state.currentUser ? state.currentUser.id : "",
      meta: { username: user.username },
    });

    renderUsersTable();
    renderDashboard();
    showToast("User removed.");
  }

  function addUser({ username, password, role }) {
    if (!canManageUsers(state.currentUser))
      return { ok: false, error: "Not authorized." };
    const uname = String(username || "").trim();
    if (!uname) return { ok: false, error: "Username is required." };
    if (!String(password || "").trim())
      return { ok: false, error: "Password is required." };
    if (![ROLES.Admin, ROLES.Faculty, ROLES.Student].includes(role))
      return { ok: false, error: "Invalid role." };

    if (
      state.users.some((u) => u.username.toLowerCase() === uname.toLowerCase())
    ) {
      return { ok: false, error: "Username already exists." };
    }

    const user = {
      id: uid(),
      username: uname,
      password: String(password),
      role,
      createdAt: new Date().toISOString(),
    };

    state.users.push(user);
    storage.write(STORAGE_KEYS.users, state.users);

    logActivity({
      type: "USER_ADD",
      userId: state.currentUser ? state.currentUser.id : "",
      meta: { username: user.username, role: user.role },
    });

    renderUsersTable();
    renderDashboard();
    return { ok: true };
  }

  async function handleLogin(username, password) {
    const uname = String(username || "").trim();
    const p = String(password || "");

    const found = state.users.find(
      (u) =>
        u.username.toLowerCase() === uname.toLowerCase() && u.password === p,
    );
    if (!found) return { ok: false, error: "Invalid username or password." };

    state.currentUser = found;
    setSessionUserId(found.id);
    logActivity({ type: "AUTH_LOGIN", userId: found.id, meta: {} });
    return { ok: true };
  }

  function handleLogout() {
    if (state.currentUser) {
      logActivity({
        type: "AUTH_LOGOUT",
        userId: state.currentUser.id,
        meta: {},
      });
    }
    clearSession();
    state.currentUser = null;
    updateNav();
    setView("viewLogin");
    location.hash = "#login";
    showToast("Logged out.");
  }

  function goToNotices() {
    location.hash = "#notices";
  }

  function goToDashboard() {
    location.hash = "#dashboard";
  }

  function syncRoute() {
    const user = state.currentUser;
    const hash = location.hash || "#login";

    if (!user) {
      if (hash !== "#login") location.hash = "#login";
      setView("viewLogin");
      updateNav();
      return;
    }

    if (hash === "#dashboard") {
      if (!canManageUsers(user)) {
        location.hash = "#notices";
        return;
      }
      setView("viewDashboard");
      updateNav();
      renderDashboard();
      renderUsersTable();
      return;
    }

    // default
    setView("viewNotices");
    updateNav();
    renderNotices();
    return;
  }

  function wireEvents() {
    // Login
    const loginForm = $("#loginForm");
    const showDefaults = $("#btnShowDefaults");
    const demoCreds = $("#demoCredentials");
    loginForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = $("#loginUsername").value;
      const password = $("#loginPassword").value;
      const result = await handleLogin(username, password);
      if (!result.ok) {
        showToast(result.error || "Login failed.");
        return;
      }
      updateNav();
      // Simple post-login flow: admin/faculty go to notices, admin dashboard is available too.
      location.hash =
        state.currentUser.role === ROLES.Admin ? "#notices" : "#notices";
      syncRoute();
      showToast("Login successful.");
    });

    showDefaults?.addEventListener("click", () => {
      if (!demoCreds) return;
      demoCreds.classList.toggle("hidden");
    });

    // Nav
    $("#navLogin")?.addEventListener("click", () => {
      clearSession();
      state.currentUser = null;
      location.hash = "#login";
      syncRoute();
    });
    $("#navNotices")?.addEventListener("click", () => goToNotices());
    $("#navDashboard")?.addEventListener("click", () => goToDashboard());
    $("#navLogout")?.addEventListener("click", () => handleLogout());

    // Notices filters
    $("#searchInput")?.addEventListener("input", (e) => {
      state.ui.searchQuery = e.target.value || "";
      renderNotices();
    });
    $("#categoryFilter")?.addEventListener("change", (e) => {
      state.ui.categoryFilter = e.target.value || "all";
      renderNotices();
    });
    $("#sortSelect")?.addEventListener("change", (e) => {
      state.ui.sortOrder = e.target.value || "newest";
      renderNotices();
    });

    // Create notice button
    $("#btnNewNotice")?.addEventListener("click", () => {
      if (!canManageNotices(state.currentUser)) {
        showToast("You don't have permission to create notices.");
        return;
      }
      openModal("create");
    });

    // Modal controls
    $("#btnCloseModal")?.addEventListener("click", () => closeModal());
    $("#btnCancelModal")?.addEventListener("click", () => closeModal());
    $("#modalOverlay")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "modalOverlay") closeModal();
    });

    // Add URL attachment
    $("#btnAddAttachmentUrl")?.addEventListener("click", () => {
      const input = $("#attachmentUrl");
      if (!input) return;
      addAttachmentUrl(input.value);
      input.value = "";
    });

    // Add files attachment
    $("#attachmentFiles")?.addEventListener("change", async (e) => {
      if (!canManageNotices(state.currentUser)) return;
      try {
        await addAttachmentsFromFiles(e.target.files);
      } catch {
        showToast("Failed to read one or more files.");
      } finally {
        e.target.value = "";
      }
    });

    // Notice form submit
    $("#noticeForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!canManageNotices(state.currentUser)) {
        showToast("You don't have permission to save notices.");
        return;
      }
      const res = createOrUpdateNoticeFromForm();
      if (!res.ok) {
        showToast(res.error || "Invalid form.");
        return;
      }

      const mode = $("#noticeFormMode").value;
      if (mode === "create") {
        createNotice(res.notice);
        logActivity({
          type: "NOTICE_CREATE",
          userId: state.currentUser ? state.currentUser.id : "",
          noticeId: res.notice.id,
          meta: { title: res.notice.title },
        });
        showToast("Notice created.");
      } else {
        updateNotice(res.notice);
        logActivity({
          type: "NOTICE_UPDATE",
          userId: state.currentUser ? state.currentUser.id : "",
          noticeId: res.notice.id,
          meta: { title: res.notice.title },
        });
        showToast("Notice updated.");
      }

      persistNotices();
      closeModal();
      renderNotices();
      updateDashboardIfNeeded();
    });

    // User add form
    $("#userAddForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!canManageUsers(state.currentUser)) {
        showToast("Admin access required.");
        return;
      }
      const username = $("#userAddUsername").value;
      const password = $("#userAddPassword").value;
      const role = $("#userAddRole").value;
      const res = addUser({ username, password, role });
      if (!res.ok) showToast(res.error || "Failed to add user.");
      else {
        $("#userAddUsername").value = "";
        $("#userAddPassword").value = "";
        $("#userAddRole").value = ROLES.Student;
      }
    });

    // Users table actions (event delegation)
    $("#usersTableBody")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      const userId = btn.getAttribute("data-userid");
      if (!action || !userId) return;

      if (action === "remove-user") {
        removeUser(userId);
        return;
      }

      if (action === "update-role") {
        const row = btn.closest("tr");
        const select = row ? row.querySelector("select[data-userid]") : null;
        const newRole = select ? select.value : "";
        changeUserRole(userId, newRole);
      }
    });
  }

  function init() {
    seedDefaultsIfNeeded();
    loadAllData();

    wireEvents();

    // Initial render
    updateNav();
    // Default view
    if (!state.currentUser) location.hash = "#login";
    if (!location.hash) location.hash = "#login";
    syncRoute();

    window.addEventListener("hashchange", () => syncRoute());
  }

  init();
})();
