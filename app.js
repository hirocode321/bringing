"use strict";

const DB_NAME = "motteru-checklist";
const DB_VERSION = 1;
const SITUATIONS = {
  shoot: { label: "撮影の日", defaults: ["カメラ", "レンズ", "予備バッテリー", "SDカード"] },
  work: { label: "仕事の日", defaults: ["スマホ", "財布", "鍵", "仕事道具"] },
  play: { label: "遊びの日", defaults: ["スマホ", "財布", "鍵", "ハンカチ"] },
};

const elements = {
  tabs: [...document.querySelectorAll(".situation")],
  list: document.querySelector("#item-list"),
  empty: document.querySelector("#empty-message"),
  situationLabel: document.querySelector("#situation-label"),
  progressRing: document.querySelector("#progress-ring"),
  progressNumber: document.querySelector("#progress-number"),
  progressCopy: document.querySelector("#progress-copy"),
  progressBar: document.querySelector("#progress-bar"),
  add: document.querySelector("#add-button"),
  reset: document.querySelector("#reset-button"),
  dialog: document.querySelector("#item-dialog"),
  dialogTitle: document.querySelector("#dialog-title"),
  form: document.querySelector("#item-form"),
  name: document.querySelector("#item-name"),
  cancel: document.querySelector("#cancel-button"),
  export: document.querySelector("#export-button"),
  import: document.querySelector("#import-button"),
  importFile: document.querySelector("#import-file"),
  status: document.querySelector("#status-message"),
};

let db;
let items = [];
let activeSituation = "shoot";
let editingId = null;
let saveQueue = Promise.resolve();

function makeItem(situation, name) {
  return { id: crypto.randomUUID(), situation, name, checked: false };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("app")) {
        request.result.createObjectStore("app");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("別のタブでデータベースを使用中です。"));
  });
}

function readItems() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("app", "readonly");
    const request = transaction.objectStore("app").get("items");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeItems(snapshot) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("app", "readwrite");
    transaction.objectStore("app").put(snapshot, "items");
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function save() {
  const snapshot = items.map(item => ({ ...item }));
  saveQueue = saveQueue.catch(() => {}).then(() => writeItems(snapshot));
  saveQueue.catch(() => showStatus("保存できませんでした。端末の空き容量やブラウザ設定を確認してください。", true));
  return saveQueue;
}

function showStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("is-error", isError);
}

function render() {
  const current = items.filter(item => item.situation === activeSituation);
  const done = current.filter(item => item.checked).length;
  const percent = current.length ? Math.round(done / current.length * 100) : 0;

  elements.tabs.forEach(tab => {
    tab.setAttribute("aria-pressed", String(tab.dataset.situation === activeSituation));
  });
  elements.situationLabel.textContent = SITUATIONS[activeSituation].label;
  elements.progressNumber.textContent = `${done}/${current.length}`;
  elements.progressCopy.textContent = current.length === 0
    ? "まずは持ち物を追加しましょう"
    : done === current.length
      ? "準備ばっちり。いってらっしゃい！"
      : `あと${current.length - done}個、確認しましょう`;
  elements.progressBar.style.width = `${percent}%`;
  elements.progressRing.style.setProperty("--progress", `${percent}%`);
  elements.empty.hidden = current.length !== 0;
  elements.reset.disabled = done === 0;
  elements.list.replaceChildren(...current.map(createItemRow));
}

function createItemRow(item) {
  const row = document.createElement("li");
  row.className = `item${item.checked ? " is-checked" : ""}`;
  row.dataset.id = item.id;

  const check = document.createElement("button");
  check.type = "button";
  check.className = "check-button";
  check.dataset.action = "check";
  check.setAttribute("aria-label", `${item.name}を${item.checked ? "未確認に戻す" : "確認する"}`);
  check.setAttribute("aria-pressed", String(item.checked));
  check.textContent = item.checked ? "✓" : "";

  const name = document.createElement("button");
  name.type = "button";
  name.className = "item-name";
  name.dataset.action = "check";
  name.textContent = item.name;
  name.setAttribute("aria-label", `${item.name}を${item.checked ? "未確認に戻す" : "確認する"}`);

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "icon-button";
  edit.dataset.action = "edit";
  edit.textContent = "編集";
  edit.setAttribute("aria-label", `${item.name}を編集`);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "icon-button delete-button";
  remove.dataset.action = "delete";
  remove.textContent = "削除";
  remove.setAttribute("aria-label", `${item.name}を削除`);

  row.append(check, name, edit, remove);
  return row;
}

function openItemDialog(item = null) {
  editingId = item?.id ?? null;
  elements.dialogTitle.textContent = item ? "持ち物を編集" : "持ち物を追加";
  elements.name.value = item?.name ?? "";
  elements.dialog.showModal();
  elements.name.focus();
}

elements.tabs.forEach(tab => tab.addEventListener("click", () => {
  activeSituation = tab.dataset.situation;
  render();
}));

elements.list.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  const row = button?.closest("li[data-id]");
  if (!row) return;
  const item = items.find(candidate => candidate.id === row.dataset.id);
  if (!item) return;

  if (button.dataset.action === "check") {
    item.checked = !item.checked;
    render();
    save();
  } else if (button.dataset.action === "edit") {
    openItemDialog(item);
  } else if (button.dataset.action === "delete" && confirm(`「${item.name}」を削除しますか？`)) {
    items = items.filter(candidate => candidate.id !== item.id);
    render();
    save();
  }
});

elements.add.addEventListener("click", () => openItemDialog());
elements.cancel.addEventListener("click", () => elements.dialog.close());
elements.form.addEventListener("submit", event => {
  event.preventDefault();
  const name = elements.name.value.trim();
  if (!name) return;
  if (editingId) {
    const item = items.find(candidate => candidate.id === editingId);
    if (item) item.name = name;
  } else {
    items.push(makeItem(activeSituation, name));
  }
  elements.dialog.close();
  render();
  save();
});

elements.reset.addEventListener("click", () => {
  items.filter(item => item.situation === activeSituation).forEach(item => { item.checked = false; });
  render();
  save();
});

elements.export.addEventListener("click", async () => {
  try {
    await saveQueue;
    const data = JSON.stringify({ version: 1, items }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `motteru-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStatus("バックアップを保存しました。");
  } catch {
    showStatus("バックアップを作れませんでした。", true);
  }
});

elements.import.addEventListener("click", () => elements.importFile.click());
elements.importFile.addEventListener("change", async () => {
  const file = elements.importFile.files?.[0];
  elements.importFile.value = "";
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error("ファイルが大きすぎます。");
    const data = JSON.parse(await file.text());
    if (data.version !== 1 || !Array.isArray(data.items) || data.items.length > 1000 ||
      !data.items.every(item => typeof item.id === "string" && item.id.length <= 100 &&
        typeof item.name === "string" && item.name.length > 0 && item.name.length <= 60 &&
        Object.hasOwn(SITUATIONS, item.situation) && typeof item.checked === "boolean")) {
      throw new Error("このアプリのバックアップではありません。");
    }
    if (!confirm("現在の持ち物を、バックアップの内容で置き換えますか？")) return;
    items = data.items.map(item => ({ id: item.id, name: item.name, situation: item.situation, checked: item.checked }));
    render();
    await save();
    showStatus("バックアップを読み込みました。");
  } catch (error) {
    showStatus(`読み込めませんでした。${error.message}`, true);
  }
});

async function start() {
  try {
    db = await openDatabase();
    const stored = await readItems();
    if (stored === undefined) {
      items = Object.entries(SITUATIONS).flatMap(([key, data]) => data.defaults.map(name => makeItem(key, name)));
      await save();
    } else if (Array.isArray(stored)) {
      items = stored;
    } else {
      throw new Error("保存データを読み取れませんでした。");
    }
    render();
  } catch (error) {
    showStatus(`このブラウザでは保存を開始できませんでした。${error.message}`, true);
    document.querySelectorAll("button").forEach(button => { button.disabled = true; });
  }
}

start();
