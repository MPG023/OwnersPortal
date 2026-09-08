const firebaseConfig = {
  apiKey: "AIzaSyCqfKoF0x5dkdsj83_lczbsm8tLQN3hzyQ",
  authDomain: "owners-login.firebaseapp.com",
  projectId: "owners-login",
  storageBucket: "owners-login.firebasestorage.app",
  messagingSenderId: "860477366916",
  appId: "1:860477366916:web:5a92f334a5b3a22c2e98d1",
  measurementId: "G-MP2N6KGMPT"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// ===== 認証付きデータ取得API（Google Apps Script） =====
// お知らせ・募集状況・書類・修繕状況・年間収支・点検レポートは、すべてこの
// 認証付きAPI経由で取得する（ログインしていない人はデータを取得できない）。
const SECURE_API_URL =
  "https://script.google.com/macros/s/AKfycbxSnwnJiR_dtybKS40qVqV3sG7IfN_XDqnbofAkLv2ikwzs2w1LNhbVYRnJj88pFsAhoA/exec";

// type: "notices" / "recruit" / "documents" / "repair" / "incomeStatement" /
//       "inspectionBasic" / "inspectionCheck" / "inspectionPhoto" /
//       "inspectionSectionNote" / "inspectionSummary" / "inspectionOccupancy" /
//       "constructionStatus"

// ログイン直後などに複数種類のデータをまとめて1回のリクエストで取得しておき、
// fetchSecureCsv() が個別に呼ばれた際はここから返すことで、通信回数を減らす。
let __batchCsvCache = null; // { type: csvTextまたは{error:...} }

async function fetchSecureCsvBatch(types) {
  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;

  if (!idToken) {
    throw new Error("ログインしていません");
  }

  const res = await fetch(
    `${SECURE_API_URL}?idToken=${encodeURIComponent(
      idToken
    )}&type=${encodeURIComponent(types.join(","))}`,
    { cache: "no-store" }
  );
  const text = await res.text();

  return JSON.parse(text); // { type: csvText または {error: "..."} }
}

async function fetchSecureCsv(type) {
  // まとめ取得（バッチ）の結果がすでにあれば、それを使って通信を省略する
  if (
    __batchCsvCache &&
    Object.prototype.hasOwnProperty.call(__batchCsvCache, type)
  ) {
    const cached = __batchCsvCache[type];
    if (cached && typeof cached === "object" && cached.error) {
      throw new Error(cached.error);
    }
    return cached;
  }

  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;

  if (!idToken) {
    throw new Error("ログインしていません");
  }

  const res = await fetch(
    `${SECURE_API_URL}?idToken=${encodeURIComponent(
      idToken
    )}&type=${encodeURIComponent(type)}`,
    { cache: "no-store" } // ブラウザに古い結果をキャッシュさせず、毎回必ず最新を取得する
  );
  const text = await res.text();

  // サーバー側がエラーを返した場合はJSON（{"error": "..."}）になっている
  if (text.trim().startsWith("{")) {
    try {
      const json = JSON.parse(text);
      if (json.error) throw new Error(json.error);
    } catch (e) {
      // JSONとして壊れている場合はそのままCSVとして扱う（通常は起きない）
    }
  }

  return text;
}

// 読んだお知らせ（アカウントごとにFirestoreへ保存し、端末をまたいで共有する）
let readNotices = [];
let currentUserUid = null;
let currentUserEmail = null;

// ===== CSVパース（ダブルクォート内の改行・カンマに対応） =====
// スプレッドシートのセルに長文（改行やカンマを含む文章）を入れても、
// 行が分裂して複数件に見えてしまわないようにするための共通処理。
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // 無視（\r\n対策）
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function backHome() {
  showPage("home");
}

const properties = {
  "ルミナス・スターズ": {
    image:
      "https://mpg023.github.io/OwnersPortal/images/construction/cards/luminous-stars.JPG",
    address: "長野県塩尻市 広丘原新田 ２０６－１３",
    owner: "小松 　宗夫",

    contract: "フルパッケージ",
    office: "松本",
    staff: "鈴木  　康治",
    inspectionDate: "2026/08/06",
    cleaningDate: "2026/07/24",
    contractDate: "2025/02/20",
    completion: "2026/01/31",
    totalBuildings: "",
    totalUnits: "8戸",
    occupiedUnits: "8戸",
    moveOut: "0戸",
    futureOccupied: "8戸",
    futureRate: "87.5%"
  },

  小松住宅: {
    image:
      "https://mpg023.github.io/OwnersPortal/images/construction/cards/komatsu.JPG",
    address: "長野県塩尻市 広丘原新田 ２０６－１",
    owner: "小松 　宗夫",

    contract: "自主管理/一部不動産仲介",
    office: "-",
    staff: "小松　泰輝",
    salesstaff: "-",
    inspectionDate: "2026/09/08",
    cleaningDate: "2026/07/17",
    contractDate: "-",
    completion: "1982/10/25",
    totalBuildings: "4戸",
    totalUnits: "4戸",
    occupiedUnits: "4戸",
    moveOut: "0戸",
    futureOccupied: "4戸",
    futureRate: "87.5%"
  }
};

function getBuildingAge(completionDate) {
  const built = new Date(completionDate);
  if (Number.isNaN(built.getTime())) {
    return "-";
  }

  const today = new Date();
  let years = today.getFullYear() - built.getFullYear();
  let months = today.getMonth() - built.getMonth();

  if (today.getDate() < built.getDate()) {
    months--;
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  return `築${years}年${months}ヶ月`;
}

function showDetail(name) {
  const item = properties[name];

  if (!item) return;

  hideAllPages();

  document.getElementById("detail").classList.add("active");

  document.getElementById("buildingName").textContent = name;
  document.getElementById("contract").textContent = item.contract;
  document.getElementById("office").textContent = item.office;
  document.getElementById("staff").textContent = item.staff;

  document.getElementById("inspectionDate").textContent =
    item.inspectionDate || "未登録";
  document.getElementById("cleaningDate").textContent =
    item.cleaningDate || "未登録";
  document.getElementById("contractDate").textContent = item.contractDate;
  document.getElementById("completion").textContent = item.completion;
  document.getElementById("age").textContent = getBuildingAge(item.completion);

  document.getElementById("totalBuildings").textContent = item.totalBuildings;
  document.getElementById("occupiedUnits").textContent = item.occupiedUnits;

  const occupancyRate = item.occupancyRate
    ? item.occupancyRate
    : calcOccupancyRate(
        item.totalBuildings || item.totalUnits,
        item.occupiedUnits
      );
  document.getElementById("occupancyRate").textContent = occupancyRate;
  document.getElementById("moveOut").textContent = item.moveOut;
  document.getElementById("futureOccupied").textContent = item.futureOccupied;
  document.getElementById("futureRate").textContent = item.futureRate;

  const totalBuildingsRow = document.getElementById("totalBuildingsRow");

  if (name === "ルミナス・スターズ") {
    totalBuildingsRow.style.display = "none";
  } else {
    totalBuildingsRow.style.display = "";
  }

  const historyButton = document.getElementById("historyButton");

  if (name === "ルミナス・スターズ") {
    historyButton.style.display = "";
  } else {
    historyButton.style.display = "none";
  }
}

// ===== ログイン／ログアウト =====
// 画面の切り替えは firebase.auth().onAuthStateChanged が一元管理する。
// login()/logout() はFirebaseへの認証操作のみを行う。

function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const rememberMe = document.getElementById("rememberMeCheckbox").checked;

  // 「記憶する」がオンならブラウザを閉じてもログイン状態を保持（Firebase標準のセッション機能）。
  // オフなら、このタブを閉じたらログイン状態は破棄される。
  // パスワードそのものはどこにも保存しない（ブラウザ自体のパスワード保存機能に任せる）。
  const persistence = rememberMe
    ? firebase.auth.Auth.Persistence.LOCAL
    : firebase.auth.Auth.Persistence.SESSION;

  auth
    .setPersistence(persistence)
    .then(() => auth.signInWithEmailAndPassword(email, password))
    .then(() => {
      // 入力の手間を減らすため、メールアドレスのみ記憶する（パスワードは保存しない）
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }
    })
    .catch((error) => {
      alert("ログイン失敗\n" + error.message);
    });
}

// フォーム送信として扱うことで、ブラウザ標準の「パスワードを保存しますか？」を
// 正しく認識させる（ボタンのクリックイベントだけだと表示されないブラウザが多いため）。
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault(); // ページの再読み込みは防ぐ（ログイン処理自体はlogin()で行う）
      login();
    });
  }
});

// ページ読み込み時、記憶されたメールアドレスがあれば入力欄に復元する（パスワードは復元しない）
function restoreRememberedLogin() {
  // 以前のバージョンで保存されていた平文パスワードが端末に残っていれば削除する
  localStorage.removeItem("rememberedPassword");

  const email = localStorage.getItem("rememberedEmail");

  if (email) {
    const emailInput = document.getElementById("email");
    const rememberCheckbox = document.getElementById("rememberMeCheckbox");

    if (emailInput) emailInput.value = email;
    if (rememberCheckbox) rememberCheckbox.checked = true;
  }
}

function logout() {
  const result = confirm("ログアウトしてもよろしいですか？");

  if (!result) {
    return;
  }

  auth
    .signOut()
    .then(() => {
      localStorage.removeItem("loggedIn");
      document.getElementById("portal").style.display = "none";
      document.getElementById("loginPage").style.display = "flex";
    })
    .catch((error) => {
      console.error(error);
    });
}

// ===== 自動ログアウト（一定時間操作がない場合） =====

// 何も操作がない状態が続いた場合に自動的にログアウトするまでの時間
const LOGOUT_TIMEOUT_MS = 30 * 60 * 1000; // 30分

let logoutTimer = null;

function resetLogoutTimer() {
  if (logoutTimer) {
    clearTimeout(logoutTimer);
  }

  logoutTimer = setTimeout(handleInactivityTimeout, LOGOUT_TIMEOUT_MS);
}

function handleInactivityTimeout() {
  auth.signOut().catch((error) => {
    console.error(error);
  });

  localStorage.removeItem("loggedIn");

  document.getElementById("portal").style.display = "none";
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("timeoutPage").style.display = "block";
}

function goToLoginFromTimeout() {
  document.getElementById("timeoutPage").style.display = "none";
  document.getElementById("loginPage").style.display = "flex";
}

// ログイン中のみ、操作があるたびに自動ログアウトのタイマーをリセットする
["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach(
  (eventName) => {
    document.addEventListener(eventName, () => {
      if (localStorage.getItem("loggedIn") === "true") {
        resetLogoutTimer();
      }
    });
  }
);

document.addEventListener("DOMContentLoaded", () => {
  restoreRememberedLogin();

  const today = new Date();

  // 2026年固定
  let currentYear = 2026;
  let currentMonth = today.getMonth() + 1;

  // 今日の日
  const day = today.getDate();

  document.querySelectorAll(".auto-date").forEach((box) => {
    box.textContent = `${currentMonth}月${day}日現在の最新情報を表示しています。`;
  });

  createHomeCards();

  loadHistory();

  normalizeNoticeButton();

  // Firebaseの認証確認が完了するまでの間、前回のログイン状態を仮表示する
  // （チラつき防止）。最終的な画面の確定は onAuthStateChanged が行う。
  if (localStorage.getItem("loggedIn") === "true") {
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("portal").style.display = "block";
  } else {
    document.getElementById("loginPage").style.display = "flex";
    document.getElementById("portal").style.display = "none";
    loadNotices();
  }
});

function togglePassword() {
  const password = document.getElementById("password");

  if (password.type === "password") {
    password.type = "text";
  } else {
    password.type = "password";
  }
}

// 下部のお知らせボタンを他のボタンと同じスタイル／挙動に揃える
function normalizeNoticeButton() {
  const selectors = [
    "#noticeButton",
    "#noticeBtn",
    ".notice-button",
    "#bottomNotice",
    "#bottomNoticeBtn",
    "#openNoticeButton"
  ];

  selectors.forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;

    el.classList.add("recruit-btn");

    el.onclick = (e) => {
      e.stopPropagation();
      showPage("noticeListPage");
    };

    if (!el.textContent.trim()) el.textContent = "お知らせ";
  });
}

async function loadUserProfile(user) {
  const candidateCollections = ["kk-4365 User", "tk-0814 User"];

  const results = await Promise.allSettled(
    candidateCollections.map((collectionName) =>
      db.collection(collectionName).doc(user.uid).get()
    )
  );

  let data = null;

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      if (result.value.exists && !data) {
        data = result.value.data();
      }
    } else {
      console.error(
        `オーナー情報の取得に失敗しました (${candidateCollections[i]}):`,
        result.reason
      );
    }
  });

  const displayName =
    data && data.Name ? `${data.Name} 様` : "取得できませんでした";

  const ownerNameEl = document.getElementById("ownerName");
  if (ownerNameEl) ownerNameEl.textContent = displayName;

  const ownerRoleEl = document.getElementById("ownerRole");
  if (ownerRoleEl) ownerRoleEl.textContent = data ? data.Role || "" : "";

  const ownerNameBarEl = document.getElementById("ownerNameBar");
  if (ownerNameBarEl) ownerNameBarEl.textContent = displayName;

  if (!data) {
    console.warn(
      "オーナー情報が見つかりませんでした。UID:",
      user.uid,
      "— Firestoreの「kk-4365 User」「tk-0814 User」コレクション内のドキュメントIDが、このUIDと一致しているか確認してください。"
    );
  }
}

// ===== ログイン直後に全データを先読みする =====
// これにより、各ページを開いたときに毎回読み込み待ちが発生せず、即座に表示される。
//
// 「前回表示していた内容をまず即座に出し、裏側で最新版を取得して更新する」方式にすることで、
// 通信を待たせずに開いた瞬間から画面が表示され、かつ内容は常に最新に保たれる。
const PRELOAD_TYPES = [
  "notices",
  "recruit",
  "documents",
  "repair",
  "incomeStatement",
  "inspectionBasic",
  "inspectionCheck",
  "inspectionPhoto",
  "inspectionSectionNote",
  "inspectionSummary",
  "inspectionOccupancy",
  "constructionStatus"
];

const PRELOAD_CACHE_KEY = "preloadDataCache_v1";

function savePreloadCache(batch) {
  try {
    localStorage.setItem(PRELOAD_CACHE_KEY, JSON.stringify(batch));
  } catch (e) {
    console.warn("先読みキャッシュの保存に失敗しました：", e);
  }
}

function loadPreloadCache() {
  try {
    const raw = localStorage.getItem(PRELOAD_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// 「取得済み」フラグを一旦リセットし、次のrunAllLoaders()で必ず読み直させる
// （お支払いは専用のキャッシュ・再試行機構を持つため、ここでは対象外にする）
function resetPreloadFlags() {
  recruitStatusLoaded = false;
  documentsLoaded = false;
  repairLoaded = false;
  incomeLoaded = false;
  inspectionDataLoaded = false;
  constructionDataLoaded = false;
}

async function runAllLoaders() {
  const results = await Promise.allSettled([
    loadNotices(),
    ensureRecruitLoaded(),
    ensureDocumentsLoaded(),
    ensureRepairLoaded(),
    loadIncome(),
    loadInspectionData(),
    ensureConstructionStatusLoaded()
  ]);

  results.forEach((r) => {
    if (r.status === "rejected") {
      console.error("読み込みに失敗した項目があります：", r.reason);
    }
  });
}

async function preloadAllData() {
  // お支払いは専用のキャッシュ・再試行機構をすでに持っているため、並行して1回だけ呼ぶ
  loadPayments();

  // ① 前回取得してあった内容が端末に残っていれば、まずそれで即座に表示する
  //    （通信を待たせず、開いた瞬間に前回の内容が見える状態にする）
  const cached = loadPreloadCache();
  if (cached) {
    __batchCsvCache = cached;
    await runAllLoaders();
    __batchCsvCache = null;
  }

  // ② 裏側で最新のデータをまとめて1回のリクエストで取得し直し、取れ次第画面を更新する
  try {
    const fresh = await fetchSecureCsvBatch(PRELOAD_TYPES);

    savePreloadCache(fresh); // 次回開いたときのために保存しておく

    __batchCsvCache = fresh;
    resetPreloadFlags(); // 上のキャッシュ表示で立った「取得済み」フラグを解除し、必ず読み直させる
    await runAllLoaders();
    __batchCsvCache = null;
  } catch (e) {
    console.error(
      "最新データの取得に失敗しました（前回表示した内容のままになっています）：",
      e
    );
  }
}

firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    console.log("UID:", user.uid);

    localStorage.setItem("loggedIn", "true");
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("portal").style.display = "block";

    currentUserUid = user.uid;
    currentUserEmail = user.email;

    loadUserProfile(user);
    await loadReadNotices(user.uid); // 既読状態を先に読み込んでから
    preloadAllData(); // ログイン直後に全データを先読みしておく
    setInterval(loadNotices, 30000);
    backHome();
    resetLogoutTimer();
  } else {
    currentUserUid = null;
    localStorage.removeItem("loggedIn");
    document.getElementById("loginPage").style.display = "flex";
    document.getElementById("portal").style.display = "none";
  }
});

function createHomeCards() {
  const container = document.getElementById("propertyContainer");
  if (!container) return;

  container.innerHTML = "";

  Object.keys(properties).forEach((name) => {
    const item = properties[name];

    const card = document.createElement("div");
    card.className = "property-card";

    card.innerHTML = `

      <h3 class="card-title">${name}</h3>

      <div class="card-content">

        <div class="card-image">
          <img src="${item.image}" onerror="this.style.display='none'">
        </div>

        <div class="card-info">

          <div class="card-button-area">

            <button class="recruit-btn"
              onclick="event.stopPropagation();
              ${
                name === "ルミナス・スターズ"
                  ? "showPage('building-status')"
                  : "showPage('komatsu-status')"
              }">
              入居募集状況
            </button>

            ${
              name === "ルミナス・スターズ"
                ? `
                <button class="history-btn"
                onclick="event.stopPropagation();openPhotoMenu('ルミナス・スターズ');">
                建物に関する写真
                </button>
                `
                : `
                <button class="history-btn"
                onclick="event.stopPropagation();openPhotoMenu('小松住宅');">
                建物に関する写真
                </button>
                `
            }

           <button class="repair-btn"
onclick="event.stopPropagation();
openDocumentMenu('${name}');">
建物に関する書類
</button>

          </div>

          <table class="card-table">

            <tr>
              <th>所在地</th>
              <td>${item.address}</td>
            </tr>

            <tr>
              <th>ご契約者様</th>
              <td>${item.owner}</td>
            </tr>

            <tr>
              <th>契約形態</th>
              <td>${item.contract}</td>
            </tr>

            <tr>
              <th>管理営業所</th>
              <td>${item.office}</td>
            </tr>

            <tr>
              <th>担当者</th>
              <td>${item.staff}</td>
            </tr>

            <tr>
              <th>点検実施日</th>
              <td>${item.inspectionDate || "-"}</td>
            </tr>

            <tr>
              <th>清掃実施日</th>
              <td>${item.cleaningDate || "-"}</td>
            </tr>

          </table>

        </div>

      </div>

      <div class="summary-table">

        <div class="summary-head">契約日</div>
        <div class="summary-head">完工日</div>
        <div class="summary-head">築年数</div>

        <div class="summary-value">${item.contractDate}</div>
        <div class="summary-value">${item.completion}</div>
        <div class="summary-value">${getBuildingAge(item.completion)}</div>

        <div class="summary-head">
          ${name === "小松住宅" ? "戸数" : "戸数"}
        </div>

        <div class="summary-head">
          ${name === "小松住宅" ? "入居戸数" : "入居戸数"}
        </div>

        <div class="summary-head">入居率</div>

        <div class="summary-value">
          ${item.totalBuildings || item.totalUnits}
        </div>

        <div class="summary-value">
          ${item.occupiedUnits}
        </div>

        <div class="summary-value">
          ${calcOccupancyRate(
            item.totalBuildings || item.totalUnits,
            item.occupiedUnits
          )}
        </div>

      </div>

    `;

    container.appendChild(card);
  });
}

function showPage(pageId) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "flex";

  setTimeout(() => {
    try {
      hideAllPages();

      const page = document.getElementById(pageId);

      if (page) {
        page.classList.add("active");
      }

      // ★追加
      if (pageId === "buildingInfo") {
        createHomeCards();
      }

      if (pageId === "noticeListPage") {
        loadNotices();
      }

      if (pageId === "paymentPage") {
        loadPayments();
      }

      if (pageId === "komatsu-status") {
        loadRecruitStatus("小松住宅");
      }

      if (pageId === "building-status") {
        loadRecruitStatus("ルミナス・スターズ");
      }

      if (pageId === "dashboard") {
        renderDashboardCharts();
      }

      if (pageId === "ownerInfo") {
        renderSettingsPage();
      }
    } catch (e) {
      console.error(e);
    } finally {
      // どんな場合でも必ずローディング画面を閉じる
      if (overlay) overlay.style.display = "none";
    }
  }, 500);
}

// ===== 建物完成までの歩み =====

// 画像一覧
const historyImages = [];

for (let i = 113; i <= 130; i++) {
  historyImages.push(
    `https://mpg023.github.io/OwnersPortal/images/construction/IMG_0${i}.jpg`
  );
}

let historyIndex = 0;
let slideTimer = null;

// 初期表示
function loadHistory() {
  const main = document.getElementById("mainHistoryImage");
  const list = document.getElementById("historyList");

  if (!main || !list) return;

  historyIndex = 0;
  main.src = historyImages[0];

  list.innerHTML = "";

  historyImages.forEach((img, index) => {
    list.innerHTML += `
      <div class="history-thumb" onclick="showHistory(${index})">
        <div style="width:30px;text-align:center;">${index + 1}</div>
        <img src="${img}" alt="工事写真 ${
      index + 1
    }" onerror="this.style.display='none'">
      </div>
    `;
  });
}

function showHistory(index) {
  historyIndex = index;
  document.getElementById("mainHistoryImage").src = historyImages[index];
}

function nextHistory() {
  historyIndex++;

  if (historyIndex >= historyImages.length) {
    historyIndex = 0;
  }

  showHistory(historyIndex);
}

function prevHistory() {
  historyIndex--;

  if (historyIndex < 0) {
    historyIndex = historyImages.length - 1;
  }

  showHistory(historyIndex);
}

function openHistoryImage() {
  const modal = document.getElementById("imageModal");
  const modalImg = document.getElementById("modalImage");

  if (!modal || !modalImg) return;

  modal.style.display = "block";
  modalImg.src = historyImages[historyIndex];
}

function toggleSlide() {
  if (slideTimer) {
    clearInterval(slideTimer);
    slideTimer = null;
    return;
  }

  slideTimer = setInterval(nextHistory, 3000);
}

function closeModal() {
  const modal = document.getElementById("imageModal");
  if (modal) modal.style.display = "none";
}

function nextModal() {
  nextHistory();

  const modalImg = document.getElementById("modalImage");
  if (modalImg) modalImg.src = historyImages[historyIndex];
}

function prevModal() {
  prevHistory();

  const modalImg = document.getElementById("modalImage");
  if (modalImg) modalImg.src = historyImages[historyIndex];
}

// ===== 工事の状況 =====
//
// スプレッドシートの列構成：
// 1列目：建物名（例：ルミナス・スターズ／小松住宅）※物件一覧の建物名と完全に一致させてください
// 2列目：工事名（プロジェクトのタイトル。例：小松宗夫様集合住宅新築工事）
// 3列目：撮影日（例：2026/01/20）
// 4列目：工程（例：上棟〜完成）
// 5列目：カテゴリ（「定点写真」「他写真」「スケジュール」のいずれか。タブの絞り込みに使用）
// 6列目：写真URL（Googleドライブ等に保存し、「リンクを知っている全員が閲覧可」の共有リンク）

let constructionData = [];
let constructionDataLoaded = false;

let constructionAllPhotos = []; // 選択中の建物の全写真（新しい順）
let constructionFilteredPhotos = []; // タブで絞り込んだ写真
let constructionCurrentCategory = "all";
let constructionIndex = 0;
let constructionSlideTimer = null;

async function ensureConstructionStatusLoaded() {
  if (constructionDataLoaded) return;
  try {
    const text = await fetchSecureCsv("constructionStatus");
    constructionData = parseCSV(text).slice(1); // ヘッダー行を除く
    constructionDataLoaded = true;
  } catch (e) {
    console.error("工事の状況データの取得に失敗しました：", e);
    constructionData = [];
  }
}

async function loadConstructionStatus(buildingName) {
  await ensureConstructionStatusLoaded();

  const rows = constructionData.filter((c) => c[0] === buildingName);

  const titleEl = document.getElementById("constructionProjectTitle");
  if (titleEl) {
    titleEl.textContent = rows.length > 0 ? rows[0][1] : buildingName;
  }

  // 新しい撮影日が上に来るように並べ替える
  constructionAllPhotos = rows
    .map((c) => ({
      date: c[2] || "",
      phase: c[3] || "",
      category: c[4] || "",
      url: toEmbeddablePdfImageUrl(c[5] || "")
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  constructionCurrentCategory = "all";
  document.querySelectorAll(".construction-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.category === "all");
  });

  renderConstructionList();
}

function filterConstructionTab(category) {
  constructionCurrentCategory = category;

  document.querySelectorAll(".construction-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.category === category);
  });

  renderConstructionList();
}

function renderConstructionList() {
  constructionFilteredPhotos =
    constructionCurrentCategory === "all"
      ? constructionAllPhotos
      : constructionAllPhotos.filter(
          (p) => p.category === constructionCurrentCategory
        );

  const listEl = document.getElementById("constructionList");
  if (listEl) {
    if (constructionFilteredPhotos.length === 0) {
      listEl.innerHTML =
        constructionCurrentCategory === "スケジュール"
          ? '<p class="construction-empty-schedule">スケジュールは登録されていません。</p>'
          : '<p style="padding:16px;color:#999;">該当する写真がありません。</p>';
    } else {
      // 撮影日ごとにグループ化する
      const groups = [];
      const groupMap = {};
      constructionFilteredPhotos.forEach((p, idx) => {
        if (!groupMap[p.date]) {
          groupMap[p.date] = [];
          groups.push(p.date);
        }
        groupMap[p.date].push(idx);
      });

      listEl.innerHTML = groups
        .map((date) => {
          const dateLabel = formatConstructionDate(date);
          const thumbs = groupMap[date]
            .map(
              (idx) => `
              <img src="${constructionFilteredPhotos[idx].url}"
                   onclick="showConstruction(${idx})"
                   onerror="this.style.display='none'">
            `
            )
            .join("");
          return `
            <div class="construction-date-group">
              <div class="construction-date-label">${dateLabel}</div>
              <div class="construction-thumbs">${thumbs}</div>
            </div>
          `;
        })
        .join("");
    }
  }

  showConstruction(0);
}

// 「2026/01/20」→「2026年<br>01月20日」のような表示用に整形する
function formatConstructionDate(date) {
  const parts = String(date).split(/[\/\-]/);
  if (parts.length === 3) {
    return `${parts[0]}年<br>${parts[1]}月${parts[2]}日`;
  }
  return date;
}

function showConstruction(index) {
  if (constructionFilteredPhotos.length === 0) {
    constructionIndex = 0;
    setText("constructionDate", "-");
    setText("constructionPhase", "-");
    const img = document.getElementById("constructionMainImage");
    if (img) img.src = "";
    return;
  }

  constructionIndex =
    ((index % constructionFilteredPhotos.length) +
      constructionFilteredPhotos.length) %
    constructionFilteredPhotos.length;

  const photo = constructionFilteredPhotos[constructionIndex];

  const img = document.getElementById("constructionMainImage");
  if (img) {
    img.style.display = "";
    img.src = photo.url;
  }

  setText("constructionDate", photo.date || "-");
  setText("constructionPhase", photo.phase || "-");
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = text;
}

function nextConstruction() {
  showConstruction(constructionIndex + 1);
}

function prevConstruction() {
  showConstruction(constructionIndex - 1);
}

function toggleConstructionSlide() {
  if (constructionSlideTimer) {
    clearInterval(constructionSlideTimer);
    constructionSlideTimer = null;
    return;
  }
  constructionSlideTimer = setInterval(nextConstruction, 3000);
}

function openConstructionImage() {
  if (constructionFilteredPhotos.length === 0) return;

  const modal = document.getElementById("imageModal");
  const modalImg = document.getElementById("modalImage");
  if (!modal || !modalImg) return;

  modal.style.display = "block";
  modalImg.src = constructionFilteredPhotos[constructionIndex].url;
}

function scrollConstructionList(direction) {
  const listEl = document.getElementById("constructionList");
  if (listEl) listEl.scrollBy({ top: direction * 220, behavior: "smooth" });
}

// GoogleドライブのPDF/画像共有リンクを、<img>タグでそのまま表示できる形式に変換する
function toEmbeddablePdfImageUrl(url) {
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (match) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
  }
  return url;
}

function hideAllPages() {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("active");
    page.scrollTop = 0;
  });

  window.scrollTo(0, 0);
}

function openNotice(title, date, time, body) {
  showPage("noticeDetailPage");

  document.getElementById("detailTitle").textContent = title;
  document.getElementById("detailDate").textContent = time
    ? `${date} ${time}`
    : date;
  document.getElementById("detailBody").innerHTML = body;
}

function backNoticeList() {
  showPage("noticeListPage");
}

function loadNoticeCount(count) {
  const badgeIds = ["noticeCount", "noticeCountHome"];

  badgeIds.forEach((id) => {
    const badge = document.getElementById(id);
    if (!badge) return;

    if (count > 0) {
      badge.style.display = "flex";
      badge.textContent = count;
    } else {
      badge.style.display = "none";
    }
  });
}

function calcOccupancyRate(total, occupied) {
  const totalNum = parseInt(total);
  const occupiedNum = parseInt(occupied);

  if (isNaN(totalNum) || totalNum === 0) {
    return "0%";
  }

  return ((occupiedNum / totalNum) * 100).toFixed(1).replace(".0", "") + "%";
}

// お知らせの既読状態をFirestoreから読み込む（アカウント単位で共有される）
async function loadReadNotices(uid) {
  try {
    const doc = await db.collection("readNotices").doc(uid).get();
    readNotices =
      doc.exists && Array.isArray(doc.data().ids) ? doc.data().ids : [];
  } catch (e) {
    console.error("既読情報の取得に失敗しました:", e);
    readNotices = [];
  }
}

// お知らせを既読にする（Firestoreに保存し、他の端末にも反映される）
async function markNoticeAsRead(id) {
  if (readNotices.includes(id)) return;

  readNotices.push(id);

  if (!currentUserUid) return;

  try {
    await db
      .collection("readNotices")
      .doc(currentUserUid)
      .set({ ids: readNotices });
  } catch (e) {
    console.error("既読情報の保存に失敗しました:", e);
  }
}

async function loadNotices() {
  const list = document.getElementById("noticeList");
  if (!list) return;

  list.innerHTML = "読み込み中...";

  try {
    const text = await fetchSecureCsv("notices");

    const rows = parseCSV(text).slice(1).reverse();

    list.innerHTML = "";

    const unreadCount = rows.filter((cols) => {
      const id = cols[0];
      return !readNotices.includes(id);
    }).length;

    loadNoticeCount(unreadCount);

    rows.forEach((cols) => {
      const id = cols[0];
      const date = cols[4] || "";
      // 「11:30:00」のように秒まで含まれている場合は、秒を切り落として「11:30」にする
      const time = (cols[5] || "").replace(/^(\d{1,2}:\d{2}):\d{2}$/, "$1");
      const title = cols[1] || "";
      const body = cols[2] || "";
      // 全角スペースや見えない文字が混ざっていても判定できるよう正規化する
      // G列（7列目・PDF・その他画像）がリンクの列
      const file = (cols[6] || "").replace(/[\u3000\u200B\uFEFF]/g, " ").trim();

      const isNew = !readNotices.includes(id);

      const newBadge = isNew ? '<span class="new-badge">新着</span>' : "";

      // リンクが添付されている場合のみ、タイトルを押すと直接リンク先へ移動する
      // http(s):// が無く www. から始まる場合や、大文字混じりのHTTPにも対応する
      const normalizedFile = file.toLowerCase();
      const isLink =
        !!file &&
        (normalizedFile.startsWith("http") ||
          normalizedFile.startsWith("www."));
      const linkHref = normalizedFile.startsWith("www.")
        ? toDirectPdfUrl(`https://${file}`)
        : toDirectPdfUrl(file);

      // アイコンも「実際にリンクとして機能する場合」だけ表示する
      const pdfIcon = isLink
        ? '<span class="material-icons notice-pdf-icon">picture_as_pdf</span>'
        : "";

      const titleHtml = isLink
        ? `<a href="${linkHref}" target="_blank" rel="noopener" class="notice-title-link" onclick="event.stopPropagation()">${title}</a>`
        : title;

      const item = document.createElement("div");
      item.className = "notice-item";

      item.innerHTML = `
    <div class="notice-date">
      ${date}${time ? " " + time : ""} ${pdfIcon} ${newBadge}
    </div>

    <div class="notice-title">
      ${titleHtml}
    </div>
  `;

      item.onclick = async () => {
        if (!readNotices.includes(id)) {
          await markNoticeAsRead(id);
          loadNotices(); // ←追加
        }

        // リンクが添付されている場合は、行のどこを押しても新規タブでリンク先を開く
        if (isLink) {
          window.open(linkHref, "_blank", "noopener");
        } else {
          openNotice(title, date, time, body, file);
        }
      };

      list.appendChild(item);
    });
  } catch (e) {
    console.error(e);
    list.innerHTML = "読み込みに失敗しました。";
  }
}

let currentPhotoBuilding = "";

function openPhotoMenu(buildingName) {
  if (buildingName) currentPhotoBuilding = buildingName;
  const menu = document.getElementById("photo-menu");
  if (menu) menu.style.display = "flex";
}

function closePhotoMenu() {
  const menu = document.getElementById("photo-menu");
  if (menu) menu.style.display = "none";
}

function openPhotoBuildingMenu() {
  const menu = document.getElementById("photo-building-menu");
  if (menu) menu.style.display = "flex";
}

function closePhotoBuildingMenu() {
  const menu = document.getElementById("photo-building-menu");
  if (menu) menu.style.display = "none";
}

// ===== 建物定期報告書：建物選択メニュー =====

// ===== 建物定期報告書：スプレッドシート連携 =====
//
// それぞれ、Googleスプレッドシートを「ファイル」→「共有」→「ウェブに公開」から
// CSV形式で発行したURLを貼り付けてください。すべてのシートに「建物名」列を用意し、
// 建物ごとにデータを絞り込んで表示します。
//
// ・INSPECTION_BASIC_CSV_URL     基本情報：建物名,オーナー様,管理営業所,担当者,建物点検日,建物CD,建物完成日,契約形態,建物写真URL,PDFのリンク
//     PDFのリンクは、建物定期報告書のPDFをGoogleドライブ等に保存し、「リンクを知っている全員が閲覧可」の
//     共有リンクを貼り付けてください。「PDFダウンロード」ボタンから、そのPDFがブラウザの標準ビューアで開きます。
// ・INSPECTION_CHECK_CSV_URL     点検項目：建物名,セクション,点検項目,判定,コメント
//     セクションは「外壁・屋根・基礎」「共用部点検」「設備点検」のいずれかを入力してください。
// ・INSPECTION_PHOTO_CSV_URL     点検写真：建物名,セクション,キャプション,コメント,写真URL
//     セクションは上の3つに加えて「点検写真」（点検2タブの写真ギャラリー用）も使えます。
//     小さい写真カードにはキャプションのみ、写真ギャラリーはキャプション＋コメントを表示します。
// ・INSPECTION_SECTION_NOTE_CSV_URL  セクション所見：建物名,セクション,所見コメント
//     セクションは「共用部点検」「設備点検」のみ対応（外壁・屋根・基礎には所見欄がありません）。
// ・INSPECTION_SUMMARY_CSV_URL   総合判定：建物名,建物全体判定,緊急対応,推奨修繕,次回点検,点検担当コメント,オーナー様へのご案内
// ・INSPECTION_OCCUPANCY_CSV_URL ご入居状況：建物名,部屋No,契約番号,入居者名,家賃,駐車場,入居日,契約満了日,備考

let inspectionDataLoaded = false;

let inspectionData = {
  basic: [],
  check: [],
  photo: [],
  sectionNote: [],
  summary: [],
  occupancy: []
};

async function fetchInspectionCSV(type) {
  try {
    const text = await fetchSecureCsv(type);
    return parseCSV(text).slice(1); // ヘッダー行を除く
  } catch (e) {
    console.error(e);
    return [];
  }
}

async function loadInspectionData() {
  if (inspectionDataLoaded) return;

  const [
    basic,
    check,
    photo,
    sectionNote,
    summary,
    occupancy
  ] = await Promise.all([
    fetchInspectionCSV("inspectionBasic"),
    fetchInspectionCSV("inspectionCheck"),
    fetchInspectionCSV("inspectionPhoto"),
    fetchInspectionCSV("inspectionSectionNote"),
    fetchInspectionCSV("inspectionSummary"),
    fetchInspectionCSV("inspectionOccupancy")
  ]);

  inspectionData = { basic, check, photo, sectionNote, summary, occupancy };
  inspectionDataLoaded = true;
}

function inspectionJudgeClass(mark) {
  if (mark === "△") return "warn";
  if (mark === "×") return "bad";
  return "good";
}

function inspectionRankClass(rank) {
  if (rank === "要注意") return "rank-warn";
  if (rank === "要修繕") return "rank-bad";
  return "rank-good";
}

function setInspectionText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

function setInspectionValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || "";
}

async function showInspectionFor(buildingName) {
  const content = document.getElementById("inspectionContent");
  const placeholder = document.getElementById("inspectionPlaceholder");
  if (!content || !placeholder) return;

  await loadInspectionData();

  const basicRow = inspectionData.basic.find((c) => c[0] === buildingName);

  if (!basicRow) {
    content.style.display = "none";
    placeholder.style.display = "block";
    return;
  }

  content.style.display = "block";
  placeholder.style.display = "none";

  renderInspectionReport(buildingName, basicRow);
}

function renderInspectionReport(buildingName, basicRow) {
  // 基本情報

  const [
    ,
    owner,
    office,
    staff,
    checkDate,
    buildingCode,
    completionDate,
    contract,
    photoUrl,
    reportPdfUrl
  ] = basicRow;

  setInspectionText("inspectionBuildingName", buildingName);
  setInspectionText("inspectionCheckDate", checkDate);
  setInspectionText("reportOwner", owner);
  setInspectionText("reportOffice", office);
  setInspectionText("reportStaff", staff);
  setInspectionText("reportInspectionDate", checkDate);
  setInspectionText("reportBuildingCode", buildingCode);
  setInspectionText("reportCompletionDate", completionDate);
  setInspectionText("reportContract", contract);

  const photoEl = document.getElementById("inspectionMainPhoto");
  if (photoEl && photoUrl) photoEl.src = photoUrl;

  // 「PDFダウンロード」ボタン：ブラウザ標準のPDFビューアでそのまま開けるよう、
  // アプリ内モーダル（iframe）は使わず、直接PDFのURLへ新規タブで飛ばす
  const pdfLink = document.getElementById("inspectionPdfLink");
  if (pdfLink) {
    if (reportPdfUrl && reportPdfUrl.trim()) {
      pdfLink.href = toDirectPdfUrl(reportPdfUrl.trim());
      pdfLink.style.display = "";
    } else {
      pdfLink.removeAttribute("href");
      pdfLink.style.display = "none";
    }
  }

  // 点検項目（点検1：外壁・屋根・基礎／共用部点検／設備点検）

  renderInspectionCheckTable(
    buildingName,
    "外壁・屋根・基礎",
    "checkTableWall"
  );
  renderInspectionCheckTable(buildingName, "共用部点検", "checkTableCommon");
  renderInspectionCheckTable(buildingName, "設備点検", "checkTableFacility");

  // 点検写真（小さい写真カード＋点検2の大きい写真ギャラリー）

  renderInspectionPhotoGrid(buildingName, "外壁・屋根・基礎", "photoGridWall");
  renderInspectionPhotoGrid(buildingName, "共用部点検", "photoGridCommon");
  renderInspectionPhotoGrid(buildingName, "設備点検", "photoGridFacility");
  renderInspectionGallery(buildingName, "点検写真", "inspectionGallery");

  // セクション所見（共用部点検／設備点検）

  const commonNote = inspectionData.sectionNote.find(
    (c) => c[0] === buildingName && c[1] === "共用部点検"
  );
  setInspectionValue("inspectionComment1", commonNote ? commonNote[2] : "");

  const facilityNote = inspectionData.sectionNote.find(
    (c) => c[0] === buildingName && c[1] === "設備点検"
  );
  setInspectionValue("inspectionComment2", facilityNote ? facilityNote[2] : "");

  // 総合判定（点検2タブ）

  const summaryRow = inspectionData.summary.find((c) => c[0] === buildingName);

  if (summaryRow) {
    const [
      ,
      rank,
      urgent,
      recommend,
      nextDate,
      staffComment,
      ownerComment
    ] = summaryRow;

    const rankEl = document.getElementById("summaryRank");
    if (rankEl) {
      rankEl.textContent = rank || "";
      rankEl.className = inspectionRankClass(rank);
    }

    setInspectionText("summaryUrgent", urgent);
    setInspectionText("summaryRecommend", recommend);
    setInspectionText("summaryNextDate", nextDate);
    setInspectionValue("staffComment", staffComment);
    setInspectionValue("ownerComment", ownerComment);
  }

  // ご入居状況

  renderInspectionOccupancyTable(buildingName);
}

function renderInspectionCheckTable(buildingName, sectionName, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  const rows = inspectionData.check.filter(
    (c) => c[0] === buildingName && c[1] === sectionName
  );

  tbody.innerHTML = "";

  if (rows.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="3" style="text-align:center">該当データがありません</td></tr>';
    return;
  }

  rows.forEach((c) => {
    const item = c[2] || "";
    const mark = c[3] || "";
    const comment = c[4] || "";

    tbody.innerHTML += `
    <tr>
      <td>${item}</td>
      <td class="${inspectionJudgeClass(mark)}">${mark}</td>
      <td>${comment}</td>
    </tr>
    `;
  });
}

function renderInspectionPhotoGrid(buildingName, sectionName, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const rows = inspectionData.photo.filter(
    (c) => c[0] === buildingName && c[1] === sectionName
  );

  container.innerHTML = "";

  rows.forEach((c) => {
    const caption = c[2] || "";
    const photoUrl = c[4] || "";

    container.innerHTML += `
    <div class="inspection-photo-card">
      <img src="${photoUrl}" onerror="this.style.display='none'">
      <div>${caption}</div>
    </div>
    `;
  });
}

function renderInspectionGallery(buildingName, sectionName, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const rows = inspectionData.photo.filter(
    (c) => c[0] === buildingName && c[1] === sectionName
  );

  container.innerHTML = "";

  rows.forEach((c) => {
    const caption = c[2] || "";
    const comment = c[3] || "";
    const photoUrl = c[4] || "";

    container.innerHTML += `
    <div class="gallery-item">
      <img src="${photoUrl}" onclick="openInspectionImage(this.src)" onerror="this.style.display='none'">
      <div class="gallery-title">${caption}</div>
      <div class="gallery-comment">${comment}</div>
    </div>
    `;
  });
}

function renderInspectionOccupancyTable(buildingName) {
  const tbody = document.getElementById("occupancyTableBody");
  if (!tbody) return;

  const rows = inspectionData.occupancy.filter((c) => c[0] === buildingName);

  tbody.innerHTML = "";

  if (rows.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" style="text-align:center">該当データがありません</td></tr>';
    return;
  }

  rows.forEach((c) => {
    const room = c[1] || "";
    const contractNo = c[2] || "";
    const tenant = c[3] || "";
    const rent = c[4] || "";
    const parking = c[5] || "";
    const moveIn = c[6] || "";
    const contractEnd = c[7] || "";
    const note = c[8] || "";

    tbody.innerHTML += `
    <tr>
      <td>${room}</td>
      <td>${contractNo}</td>
      <td>${tenant}</td>
      <td>${rent}</td>
      <td>${parking}</td>
      <td>${moveIn}</td>
      <td>${contractEnd}</td>
      <td>${note}</td>
    </tr>
    `;
  });
}

// 建物定期報告書：過去履歴（未実装のため仮の動作）
function openInspectionHistory() {
  alert("過去履歴は準備中です。");
}

const INSPECTION_GROUP_IDS = {
  cover: "inspectionGroupCover",
  check1: "inspectionGroupCheck1",
  check2: "inspectionGroupCheck2",
  cleaning: "inspectionGroupCleaning",
  occupancy: "inspectionGroupOccupancy",
  contract: "inspectionGroupContract",
  reception: "inspectionGroupReception",
  meeting: "inspectionGroupMeeting"
};

function showInspectionTab(tabKey, btnEl) {
  Object.values(INSPECTION_GROUP_IDS).forEach((groupId) => {
    const groupEl = document.getElementById(groupId);
    if (groupEl) groupEl.style.display = "none";
  });

  const targetId = INSPECTION_GROUP_IDS[tabKey];
  const targetEl = targetId ? document.getElementById(targetId) : null;
  if (targetEl) targetEl.style.display = "block";

  document.querySelectorAll(".inspection-tab").forEach((tab) => {
    tab.classList.remove("active");
  });

  if (btnEl) btnEl.classList.add("active");
}

function openInspectionMenu() {
  const menu = document.getElementById("inspection-menu");
  if (menu) menu.style.display = "flex";
}

function closeInspectionMenu() {
  const menu = document.getElementById("inspection-menu");
  if (menu) menu.style.display = "none";
}

// ===== 修繕工事の状況：建物選択メニュー =====

function openRepairMenu() {
  const menu = document.getElementById("repair-menu");
  if (menu) menu.style.display = "flex";
}

function closeRepairMenu() {
  const menu = document.getElementById("repair-menu");
  if (menu) menu.style.display = "none";
}

// ===== お支払いの状況：選択メニュー =====

function openPaymentMenu() {
  const menu = document.getElementById("payment-menu");
  if (menu) menu.style.display = "flex";
}

function closePaymentMenu() {
  const menu = document.getElementById("payment-menu");
  if (menu) menu.style.display = "none";
}

// ===== 建物に関する書類（修繕工事の状況／申請書類・図面等） =====

let currentDocBuilding = "";

function openDocumentMenu(buildingName) {
  currentDocBuilding = buildingName;

  const menu = document.getElementById("document-menu");
  if (menu) menu.style.display = "flex";
}

function closeDocumentMenu() {
  const menu = document.getElementById("document-menu");
  if (menu) menu.style.display = "none";
}

// 「建物に関する申請書類・図面等」はGoogleスプレッドシートから読み込みます。
//
// 【スプレッドシートの作り方】
// 1列目：建物名（例：ルミナス・スターズ）※物件一覧の建物名と完全に一致させてください
// 2列目：カテゴリ（例：確認申請 / 竣工関連書類）※同じカテゴリの行は自動でグループ表示されます
// 3列目：書類名（例：確認申請書）
// 4列目：PDFのリンク（Googleドライブ等にPDFを保存し、「リンクを知っている全員が閲覧可」の
//        共有リンクを貼り付けてください）
// 5列目：掲載日（例：2026年3月29日）
// 6列目：改定日（例：2026年3月29日）
//
// シート作成後は、認証付きAPI（SECURE_API_URL, type=documents）経由で取得します。
// この画面にPDFを追加したい場合、スプレッドシートに行を追加するだけでOKです。

// 「募集状況」（部屋No./駐車場CD・入居者名・家賃など）もGoogleスプレッドシートから読み込みます。
//
// 【スプレッドシートの作り方】
// 1列目：建物名（例：ルミナス・スターズ / 小松住宅）※物件一覧の建物名と完全に一致させてください
// 2列目：種別（「住居」または「駐車場」のどちらか）
// 3列目：部屋No. または 駐車場CD（例：01010 / 001）
// 4列目：募集状況（例：ご入居済 / 募集中 / お申込 / ご契約済 / 入居手続中）
// 5列目：入居日（例：2026/03/01。無ければ「-」でも可）
// 6列目：募集時の家賃・駐車料（例：64,500円 / 無料）
// 7列目：入居者名（例：*****。個人名をそのまま載せないようご注意ください）
// 8列目：備考（任意。ホームズ掲載アーカイブページのURLなどを入れるとリンクとして表示されます）
//
// シート作成後、「ファイル」→「共有」→「ウェブに公開」からCSV形式のリンクを発行し、
// 下記のスプレッドシートは、認証付きAPI（SECURE_API_URL, type=recruit）経由で取得します。

let recruitStatusData = [];
let recruitStatusLoaded = false;

async function ensureRecruitLoaded() {
  if (recruitStatusLoaded) return;
  try {
    const text = await fetchSecureCsv("recruit");
    recruitStatusData = parseCSV(text).slice(1); // ヘッダー行を除く
    recruitStatusLoaded = true;
  } catch (e) {
    console.error("募集状況データの取得に失敗しました：", e);
    recruitStatusData = [];
  }
}

async function loadRecruitStatus(buildingName) {
  await ensureRecruitLoaded();
  renderRecruitStatusTables(buildingName);
}

function renderRecruitStatusTables(buildingName) {
  const rows = recruitStatusData.filter((c) => c[0] === buildingName);

  const housingRows = rows.filter((c) => c[1] === "住居");
  const parkingRows = rows.filter((c) => c[1] === "駐車場");

  const prefix = buildingName === "小松住宅" ? "komatsu" : "building";

  renderRecruitStatusTable(`${prefix}-housing-table`, housingRows);
  renderRecruitStatusTable(`${prefix}-parking-table`, parkingRows);
}

function renderRecruitStatusTable(tbodyId, rows) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (rows.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center">該当データがありません</td></tr>';
    return;
  }

  tbody.innerHTML = "";

  rows.forEach((c) => {
    const [, , roomNo, status, moveInDate, rent, tenantName, note] = c;

    const noteCell =
      note && note.startsWith("http")
        ? `<a href="${note}" target="_blank" class="eheya-link">● ホームズ掲載アーカイブページを見る</a>`
        : note || "";

    tbody.innerHTML += `
    <tr>
      <td>${roomNo || ""}</td>
      <td>${status || ""}</td>
      <td>${moveInDate || ""}</td>
      <td>${rent || ""}</td>
      <td>${tenantName || ""}</td>
      <td>${noteCell}</td>
    </tr>
    `;
  });
}

let documentsData = [];
let documentsLoaded = false;

async function ensureDocumentsLoaded() {
  if (documentsLoaded) return;
  try {
    const text = await fetchSecureCsv("documents");
    documentsData = parseCSV(text).slice(1);
    documentsLoaded = true;
  } catch (e) {
    console.error("書類データの取得に失敗しました：", e);
    documentsData = [];
  }
}

async function loadDocuments(buildingName) {
  const tbody = document.getElementById("documentList");
  const nameEl = document.getElementById("documentBuildingName");
  if (!tbody) return;

  if (nameEl) nameEl.textContent = buildingName;

  tbody.innerHTML = `<tr><td colspan="3">読み込み中...</td></tr>`;

  try {
    await ensureDocumentsLoaded();

    // 建物名で絞り込み、カテゴリごとにグループ化（シートの登場順を維持）
    const categories = [];
    const categoryMap = {};

    documentsData.forEach((c) => {
      const bName = (c[0] || "").trim();
      const category = (c[1] || "").trim();
      const title = (c[2] || "").trim();
      const pdfUrl = (c[3] || "").trim();
      const postedDate = (c[4] || "").trim();
      const updatedDate = (c[5] || "").trim();

      if (bName !== buildingName) return;
      if (!title || !pdfUrl) return;

      if (!categoryMap[category]) {
        categoryMap[category] = [];
        categories.push(category);
      }

      categoryMap[category].push({ title, pdfUrl, postedDate, updatedDate });
    });

    tbody.innerHTML = "";

    if (categories.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="3" class="document-empty">現在、登録されている書類はありません。</td></tr>';
      return;
    }

    categories.forEach((category) => {
      tbody.innerHTML += `
        <tr class="document-category-row">
          <td>${category}</td>
          <td>掲載日</td>
          <td>改定日</td>
        </tr>
      `;

      categoryMap[category].forEach((doc) => {
        tbody.innerHTML += `
          <tr>
            <td>
              <a class="document-link" href="javascript:void(0)" data-pdf-url="${
                doc.pdfUrl
              }" onclick="openPdfViewer(this.dataset.pdfUrl)">
                ${doc.title}
                <span class="material-icons">picture_as_pdf</span>
              </a>
            </td>
            <td>${doc.postedDate || "-"}</td>
            <td>${doc.updatedDate || "-"}</td>
          </tr>
        `;
      });
    });
  } catch (e) {
    console.error(e);
    tbody.innerHTML = '<tr><td colspan="3">読み込みに失敗しました。</td></tr>';
  }
}

// アフターサービス点検報告書（「建物に関する書類」と同じスプレッドシートの
// カテゴリ列が「アフターサービス点検報告書」の行だけを絞り込んで表示する）
async function loadAftercareDocuments(buildingName) {
  const tbody = document.getElementById("aftercareDocumentList");
  const nameEl = document.getElementById("aftercareBuildingName");
  if (!tbody) return;

  if (nameEl) nameEl.textContent = buildingName;

  tbody.innerHTML = `<tr><td colspan="3">読み込み中...</td></tr>`;

  try {
    await ensureDocumentsLoaded();

    const rows = documentsData
      .map((c) => ({
        bName: (c[0] || "").trim(),
        category: (c[1] || "").trim(),
        title: (c[2] || "").trim(),
        pdfUrl: (c[3] || "").trim(),
        postedDate: (c[4] || "").trim(),
        updatedDate: (c[5] || "").trim()
      }))
      .filter(
        (c) =>
          c.bName === buildingName &&
          c.category === "アフターサービス点検報告書" &&
          c.title &&
          c.pdfUrl
      );

    if (rows.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="3" class="document-empty">現在、登録されている書類はありません。</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(
        (doc) => `
          <tr>
            <td>
              <a class="document-link" href="javascript:void(0)" data-pdf-url="${
                doc.pdfUrl
              }" onclick="openPdfViewer(this.dataset.pdfUrl)">
                ${doc.title}
                <span class="material-icons">picture_as_pdf</span>
              </a>
            </td>
            <td>${doc.postedDate || "-"}</td>
            <td>${doc.updatedDate || "-"}</td>
          </tr>
        `
      )
      .join("");
  } catch (e) {
    console.error(e);
    tbody.innerHTML = '<tr><td colspan="3">読み込みに失敗しました。</td></tr>';
  }
}

let repairData = [];
let repairLoaded = false;

async function ensureRepairLoaded() {
  if (repairLoaded) return;
  try {
    const text = await fetchSecureCsv("repair");
    repairData = parseCSV(text).slice(1);
    repairLoaded = true;
  } catch (e) {
    console.error("修繕状況データの取得に失敗しました：", e);
    repairData = [];
  }
}

async function loadRepair(buildingName) {
  const tbody = document.getElementById("repairTable");
  if (!tbody) return;

  tbody.innerHTML = "";

  try {
    await ensureRepairLoaded();

    [...repairData].reverse().forEach((c) => {
      // 建物名が一致しないものは表示しない
      if (c[2] !== buildingName) return;

      tbody.innerHTML += `
<tr>
  <td>${c[2]}</td> <!-- 建物 -->
  <td>${c[3]}</td> <!-- 工事名 -->
  <td>${c[4]}</td> <!-- 部屋 -->
  <td>${c[5]}</td> <!-- オーナー様負担 -->
  <td>${c[6]}</td> <!-- 入居者様負担 -->
  <td>${c[7]}</td> <!-- 大東負担 -->
  <td>${c[8]}</td> <!-- 対応状況 -->
</tr>
`;
    });
  } catch (e) {
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="7">読み込みに失敗しました。</td></tr>`;
  }
}

// ===== ホームのスライダー =====

let homeSlideIndex = 0;

function showHomeSlide(index) {
  const slidesEl = document.querySelector(".home-slider .slides");
  const slideEls = document.querySelectorAll(".home-slider .slide");
  const dotEls = document.querySelectorAll(".home-slider .dot");

  if (!slidesEl || slideEls.length === 0) return;

  homeSlideIndex = (index + slideEls.length) % slideEls.length;

  slidesEl.style.transform = `translateX(-${homeSlideIndex * 100}%)`;

  slideEls.forEach((slide, i) => {
    slide.classList.toggle("active", i === homeSlideIndex);
  });

  dotEls.forEach((dot, i) => {
    dot.classList.toggle("active", i === homeSlideIndex);
  });
}

setInterval(() => {
  showHomeSlide(homeSlideIndex + 1);
}, 4000);

function openInspectionImage(src) {
  document.getElementById("inspectionImageModal").style.display = "block";

  document.getElementById("inspectionModalImage").src = src;
}

function closeInspectionImage() {
  document.getElementById("inspectionImageModal").style.display = "none";
}

// ===== PDFのアプリ内表示 =====

// 新規タブでブラウザ標準のPDFビューア（Chromeの場合はスクリーンショットのような画面）が
// 開くよう、Googleドライブの共有リンクをPDF本体への直リンクに変換する
// GoogleドライブのPDFビューア（/view）で新規タブに開けるよう、URLの形式をそろえる
// （/uc?export=download 形式はダウンロードが強制されてしまうため使わない）
// Googleドライブのページ（独自UIの画面）を経由せず、PDFの生データを直接返す形式にする。
// これによりGoogleドライブの画面は経由せず、ブラウザ自体のPDFビューアがそのまま開く。
// （export=download はダウンロードを強制してしまうため使わない）
// Googleドライブの通常画面（フォルダ表示など）は経由せず、埋め込み専用の軽量表示
// （/preview）を新規タブで開く。ダウンロードが強制されない、確実な方式。
function toDirectPdfUrl(url) {
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (match) {
    return `https://drive.google.com/file/d/${match[1]}/preview`;
  }
  return url;
}

// Googleドライブ等、既存のPDFファイルを新規タブで開く
function openPdfViewer(url) {
  if (!url) return;
  window.open(toDirectPdfUrl(url), "_blank", "noopener");
}

// 利用規約（ログイン前・ログイン後どちらからでも開ける）
function openTerms() {
  const modal = document.getElementById("termsModal");
  if (modal) modal.classList.add("open");
}

function closeTerms() {
  const modal = document.getElementById("termsModal");
  if (modal) modal.classList.remove("open");
}

// ===== 設定画面 =====

function renderSettingsPage() {
  const emailEl = document.getElementById("settingsEmail");
  if (emailEl) emailEl.textContent = currentUserEmail || "取得できませんでした";

  const rememberEl = document.getElementById("settingsRememberStatus");
  if (rememberEl) {
    const remembered = !!localStorage.getItem("rememberedEmail");
    rememberEl.textContent = remembered
      ? "有効（このブラウザでログイン状態が保持されます）"
      : "無効";
  }

  const msgEl = document.getElementById("settingsPasswordMessage");
  if (msgEl) {
    msgEl.textContent = "";
    msgEl.className = "settings-message";
  }

  const pushToggle = document.getElementById("pushToggle");
  if (pushToggle) {
    OneSignal.User.PushSubscription.optedIn
      ? (pushToggle.checked = true)
      : (pushToggle.checked = false);
  }

  const pushMsgEl = document.getElementById("settingsPushMessage");
  if (pushMsgEl) {
    pushMsgEl.textContent = "";
    pushMsgEl.className = "settings-message";
  }
}

// パスワード再設定メールを送信する
function sendPasswordResetFromSettings() {
  const msgEl = document.getElementById("settingsPasswordMessage");
  const btn = document.getElementById("settingsResetPasswordBtn");

  if (!currentUserEmail) {
    if (msgEl) {
      msgEl.textContent = "メールアドレスが取得できませんでした。";
      msgEl.className = "settings-message settings-message-error";
    }
    return;
  }

  if (btn) btn.disabled = true;

  auth
    .sendPasswordResetEmail(currentUserEmail)
    .then(() => {
      if (msgEl) {
        msgEl.textContent = `${currentUserEmail} 宛にパスワード再設定メールを送信しました。メール内のリンクから再設定してください。`;
        msgEl.className = "settings-message settings-message-success";
      }
    })
    .catch((error) => {
      if (msgEl) {
        msgEl.textContent = "送信に失敗しました：" + error.message;
        msgEl.className = "settings-message settings-message-error";
      }
    })
    .finally(() => {
      if (btn) btn.disabled = false;
    });
}

// このブラウザに記憶されたログイン情報（メールアドレス）を削除する
function clearRememberedLoginFromSettings() {
  localStorage.removeItem("rememberedEmail");
  renderSettingsPage();

  const msgEl = document.getElementById("settingsPasswordMessage");
  if (msgEl) {
    msgEl.textContent = "このブラウザに記憶されたログイン情報を削除しました。";
    msgEl.className = "settings-message settings-message-success";
  }
}

// ===== プッシュ通知（OneSignal経由） =====
// FCM直接連携は複雑すぎたため廃止し、OneSignalのSDKを使う方式に変更した。
// 購読者の管理はOneSignal側が自動で行うため、独自のトークン登録処理は不要。

// iOSのSafariは「ホーム画面に追加」した状態（PWA起動）でないと通知を受け取れない
function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalonePWA() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function setPushMessage(text, type) {
  const msgEl = document.getElementById("settingsPushMessage");
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.className =
    "settings-message" + (type ? " settings-message-" + type : "");
}

async function onPushToggleChange() {
  const toggle = document.getElementById("pushToggle");
  if (!toggle) return;

  if (toggle.checked) {
    toggle.disabled = true;
    const ok = await enablePushNotifications();
    toggle.checked = ok;
    toggle.disabled = false;
  } else {
    toggle.disabled = true;
    await disablePushNotifications();
    toggle.disabled = false;
  }
}

async function enablePushNotifications() {
  if (isIOS() && !isStandalonePWA()) {
    setPushMessage(
      "iPhone・iPadでは、ホーム画面に追加してから開いた状態でないと通知を有効にできません。共有ボタンから「ホーム画面に追加」してください。",
      "error"
    );
    return false;
  }

  try {
    await OneSignal.Notifications.requestPermission();

    if (Notification.permission !== "granted") {
      setPushMessage("通知が許可されませんでした。", "error");
      return false;
    }

    await OneSignal.User.PushSubscription.optIn();

    setPushMessage("この端末への通知をONにしました。", "success");
    return true;
  } catch (e) {
    console.error("プッシュ通知の有効化に失敗しました：", e);
    setPushMessage("通知の設定に失敗しました：" + e.message, "error");
    return false;
  }
}

async function disablePushNotifications() {
  try {
    await OneSignal.User.PushSubscription.optOut();
    setPushMessage("この端末への通知をOFFにしました。", "success");
  } catch (e) {
    console.error("プッシュ通知の無効化に失敗しました：", e);
    setPushMessage("通知の解除に失敗しました：" + e.message, "error");
  }
}

// ===== ダッシュボード（グラフ表示） =====

let paymentChartInstance = null;
let occupancyChartInstance = null;
let repairChartInstance = null;

// 文字列から金額（数字）だけを取り出す（"¥12,000" や "12,000円" などに対応）
function parseAmount(text) {
  if (!text) return 0;
  const n = Number(String(text).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

async function renderDashboardCharts() {
  if (typeof Chart === "undefined") {
    console.error(
      "Chart.jsが読み込まれていません。CDNのURLやネットワーク接続を確認してください。"
    );
    return;
  }

  // ダッシュボードで使うデータが未取得なら、念のためここで取得しておく
  await Promise.all([
    ensureRecruitLoaded(),
    ensureRepairLoaded(),
    loadPayments()
  ]);

  renderPaymentChart();
  renderOccupancyChart();
  renderRepairChart();
}

// ① お支払い金額の月別推移
function renderPaymentChart() {
  const canvas = document.getElementById("paymentChart");
  if (!canvas || typeof Chart === "undefined") return;

  const totalsByMonth = {};
  allPayments.forEach((item) => {
    const key = item.month; // "YYYY-MM"
    if (!key) return;
    totalsByMonth[key] = (totalsByMonth[key] || 0) + Number(item.price || 0);
  });

  const months = Object.keys(totalsByMonth).sort();
  const labels = months.map((m) => {
    const [y, mo] = m.split("-");
    return `${y}/${mo}`;
  });
  const data = months.map((m) => totalsByMonth[m]);

  if (paymentChartInstance) paymentChartInstance.destroy();
  paymentChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "月別合計金額（円）",
          data,
          backgroundColor: "#d4002a"
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => v.toLocaleString() + "円"
          }
        }
      }
    }
  });
}

// ② 入居率（住居のみ。駐車場は対象外）
function renderOccupancyChart() {
  const canvas = document.getElementById("occupancyChart");
  if (!canvas || typeof Chart === "undefined") return;

  const housingRows = recruitStatusData.filter((c) => c[1] === "住居");
  const occupied = housingRows.filter((c) => c[3] === "ご入居済").length;
  const other = housingRows.length - occupied;

  if (occupancyChartInstance) occupancyChartInstance.destroy();
  occupancyChartInstance = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["ご入居済", "空室・募集中など"],
      datasets: [
        {
          data: [occupied, other],
          backgroundColor: ["#d4002a", "#e0e0e0"]
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } }
    }
  });

  const summaryEl = document.getElementById("occupancyChartSummary");
  if (summaryEl) {
    const total = housingRows.length;
    const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    summaryEl.textContent = `入居率 ${rate}%（${occupied} / ${total}戸）`;
  }
}

// ③ 修繕負担内訳（オーナー様負担／入居者様負担／大東負担の合計金額）
function renderRepairChart() {
  const canvas = document.getElementById("repairChart");
  const emptyEl = document.getElementById("repairChartEmpty");
  if (!canvas || typeof Chart === "undefined") return;

  let ownerTotal = 0;
  let tenantTotal = 0;
  let companyTotal = 0;

  repairData.forEach((c) => {
    ownerTotal += parseAmount(c[5]);
    tenantTotal += parseAmount(c[6]);
    companyTotal += parseAmount(c[7]);
  });

  // 修繕データ自体が無い、または金額列が数字として読み取れない場合
  if (ownerTotal + tenantTotal + companyTotal === 0) {
    canvas.style.display = "none";
    if (emptyEl) emptyEl.style.display = "block";
    if (repairChartInstance) {
      repairChartInstance.destroy();
      repairChartInstance = null;
    }
    return;
  }

  canvas.style.display = "";
  if (emptyEl) emptyEl.style.display = "none";

  if (repairChartInstance) repairChartInstance.destroy();
  repairChartInstance = new Chart(canvas, {
    type: "pie",
    data: {
      labels: ["オーナー様負担", "入居者様負担", "大東負担"],
      datasets: [
        {
          data: [ownerTotal, tenantTotal, companyTotal],
          backgroundColor: ["#d4002a", "#f2a900", "#4a90d9"]
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.label}: ${Number(ctx.raw).toLocaleString()}円`
          }
        }
      }
    }
  });
}

const API_URL =
  "https://script.google.com/macros/s/AKfycbzCtWCIN1T_5VJGxOaOitkEOdpCXf6iH-WHyg6HAjmQoQoFyn7wWPtkAOHTCl1PWgSx5A/exec";

let allPayments = [];
let paymentsLoaded = false;

const today = new Date();

let currentYear = today.getFullYear();
let currentMonth = today.getMonth() + 1;

const PAYMENTS_CACHE_KEY = "cachedPayments";
const PAYMENTS_RETRY_COUNT = 3; // 失敗時に自動で再試行する回数
const PAYMENTS_RETRY_DELAY_MS = 1000; // 再試行までの待ち時間

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 直近で取得に成功したデータを端末に保存しておく
function savePaymentsCache(data) {
  try {
    localStorage.setItem(PAYMENTS_CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("お支払いデータのキャッシュ保存に失敗しました", e);
  }
}

// 保存済みのデータを読み出す（無ければ null）
function loadPaymentsCache() {
  try {
    const raw = localStorage.getItem(PAYMENTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// ユーザーには生のエラー文を見せず、やさしい文言＋再試行ボタンだけを表示する
function showPaymentsFallback(usedCache) {
  const tbody = document.getElementById("paymentTableBody");
  if (!tbody) return;

  if (usedCache && allPayments.length > 0) {
    // キャッシュがある場合はエラー文を出さず、そのまま普段どおり表示する
    renderPayments();
    const notice = document.createElement("div");
    notice.style.cssText =
      "text-align:center;font-size:12px;color:#999;margin-top:8px;";
    notice.textContent =
      "最新の情報を取得できなかったため、前回取得した内容を表示しています。";
    tbody.parentElement.insertAdjacentElement("afterend", notice);
    return;
  }

  tbody.innerHTML = `
    <tr>
      <td colspan="3" style="text-align:center">
        只今読み込めませんでした。しばらくしてから再度お試しください。<br>
        <button class="retry-btn" onclick="paymentsLoaded=false;loadPayments();" style="margin-top:10px;">
          再読み込み
        </button>
      </td>
    </tr>
  `;
}

async function fetchPaymentsOnce(idToken) {
  const res = await fetch(
    `${API_URL}?idToken=${encodeURIComponent(idToken)}`,
    { cache: "no-store" } // ブラウザに古い結果をキャッシュさせず、毎回必ず最新を取得する
  );
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    // Apps Script側の不調などでHTMLが返ってきた場合はここに来る
    throw new Error("invalid-json-response");
  }

  if (json && json.error) {
    throw new Error("api-error");
  }

  if (!Array.isArray(json)) {
    throw new Error("unexpected-format");
  }

  return json;
}

async function loadPayments() {
  if (paymentsLoaded) {
    renderPayments();
    return;
  }

  try {
    // ログイン中のユーザーであることを証明するトークンを取得
    const idToken = auth.currentUser
      ? await auth.currentUser.getIdToken()
      : null;

    if (!idToken) {
      // 未ログインの一瞬だけ発生しうるので、キャッシュがあればそれを出す
      const cached = loadPaymentsCache();
      if (cached) {
        allPayments = cached;
        paymentsLoaded = true;
      }
      showPaymentsFallback(!!cached);
      return;
    }

    let json = null;
    let lastError = null;

    for (let attempt = 0; attempt < PAYMENTS_RETRY_COUNT; attempt++) {
      try {
        json = await fetchPaymentsOnce(idToken);
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        if (attempt < PAYMENTS_RETRY_COUNT - 1) {
          await sleep(PAYMENTS_RETRY_DELAY_MS);
        }
      }
    }

    if (lastError) {
      console.error("お支払い情報の取得に失敗しました：", lastError);
      const cached = loadPaymentsCache();
      if (cached) {
        allPayments = cached;
        paymentsLoaded = true;
      }
      showPaymentsFallback(!!cached);
      return;
    }

    allPayments = json;
    paymentsLoaded = true;
    savePaymentsCache(json);

    // 今月にデータがまだ無い場合、データがある一番新しい月を最初に表示する
    jumpToLatestAvailableMonth();

    renderPayments();
  } catch (e) {
    console.error("お支払い情報の取得中に予期しないエラーが発生しました：", e);
    const cached = loadPaymentsCache();
    if (cached) {
      allPayments = cached;
      paymentsLoaded = true;
    }
    showPaymentsFallback(!!cached);
  }
}

// 今表示している月にデータが無い場合、データがある一番新しい月に移動する
function jumpToLatestAvailableMonth() {
  const currentKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  const hasCurrentMonthData = allPayments.some((x) => x.month === currentKey);
  if (hasCurrentMonthData) return; // 今月にデータがあるなら、そのままでよい

  const availableMonths = allPayments
    .map((x) => x.month)
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
    .sort();

  if (availableMonths.length === 0) return; // データが無ければ何もしない

  const latest = availableMonths[availableMonths.length - 1];
  const [y, m] = latest.split("-").map(Number);

  currentYear = y;
  currentMonth = m;
}

function renderPayments() {
  const key = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  const list = allPayments.filter((x) => x.month === key);

  document.getElementById(
    "paymentMonth"
  ).textContent = `${currentYear}年${String(currentMonth).padStart(2, "0")}月`;

  const tbody = document.getElementById("paymentTableBody");

  tbody.innerHTML = "";

  let total = 0;

  if (list.length === 0) {
    const availableMonths = [...new Set(allPayments.map((x) => x.month))]
      .sort()
      .join(", ");

    tbody.innerHTML = `
    <tr>
      <td colspan="3" style="text-align:center">
      該当データがありません<br>
      <span style="font-size:12px;color:#999;">
        （取得件数：全${allPayments.length}件 / データがある月：${
      availableMonths || "なし"
    }）
      </span>
      </td>
    </tr>
    `;
  } else {
    list.forEach((item) => {
      total += Number(item.price);

      tbody.innerHTML += `
      <tr>

        <td>
         <a class="document-link" href="javascript:void(0)" data-pdf-url="${
           item.pdf
         }" onclick="openPdfViewer(this.dataset.pdfUrl)">
  ${item.title}
  <span class="material-icons">picture_as_pdf</span>
</a>
        </td>

        <td>${item.date}</td>

        <td>${Number(item.price).toLocaleString()}円</td>

      </tr>
      `;
    });
  }

  document.getElementById("paymentTotal").textContent =
    total.toLocaleString() + "円";

  updateButtons();
}

function updateButtons() {
  const months = [...new Set(allPayments.map((x) => x.month))];

  const prevKey =
    currentMonth === 1
      ? `${currentYear - 1}-12`
      : `${currentYear}-${String(currentMonth - 1).padStart(2, "0")}`;

  const nextKey =
    currentMonth === 12
      ? `${currentYear + 1}-01`
      : `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  // 「今の月から1ヶ月後まで」しか未来には進めないようにする（データの有無に関係なく上限）
  const today = new Date();
  const maxKey = `${today.getFullYear()}-${String(
    today.getMonth() + 2
  ).padStart(2, "0")}`; // 今日の月の1ヶ月後

  // 前月にデータが無い場合はボタンを無効化する
  document.getElementById("prevMonthBtn").disabled = !months.includes(prevKey);

  // 次月は、「今日の月+1」を超えて進めないようにする
  document.getElementById("nextMonthBtn").disabled = nextKey > maxKey;
}

function renderPaymentsWithLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "flex";

  setTimeout(() => {
    try {
      renderPayments();
    } catch (e) {
      console.error(e);
    } finally {
      if (overlay) overlay.style.display = "none";
    }
  }, 500);
}

document.getElementById("prevMonthBtn").onclick = () => {
  // 2026年1月より前へは行けない
  if (currentYear === 2026 && currentMonth === 1) {
    return;
  }

  currentMonth--;

  if (currentMonth === 0) {
    currentMonth = 12;
    currentYear--;
  }

  renderPaymentsWithLoading();
};

document.getElementById("nextMonthBtn").onclick = () => {
  // 現在の翌月までしか進めない
  const limit = new Date();
  limit.setMonth(limit.getMonth() + 1);

  const limitYear = limit.getFullYear();
  const limitMonth = limit.getMonth() + 1;

  if (
    currentYear > limitYear ||
    (currentYear === limitYear && currentMonth >= limitMonth)
  ) {
    return;
  }

  currentMonth++;

  if (currentMonth === 13) {
    currentMonth = 1;
    currentYear++;
  }

  renderPaymentsWithLoading();
};

// ===== 年間収支内訳書 =====

// 掲載データが用意されている最初の年（それより前へは戻れません）
const INCOME_START_YEAR = 2026;

// 年間収支内訳書：認証付きAPI（SECURE_API_URL, type=incomeStatement）経由で取得します。

let allIncomeDocs = [];
let incomeLoaded = false;

const incomeToday = new Date();
let currentIncomeYear = incomeToday.getFullYear();

async function loadIncome() {
  if (incomeLoaded) {
    renderIncome();
    return;
  }

  try {
    const text = await fetchSecureCsv("incomeStatement");

    const rows = parseCSV(text).slice(1); // ヘッダー行を除く

    allIncomeDocs = rows
      .map((cols) => {
        return {
          year: (cols[0] || "").trim(),
          title: (cols[1] || "").trim(),
          date: (cols[2] || "").trim(),
          pdf: (cols[3] || "").trim()
        };
      })
      // 年が4桁の数字になっている行のみ有効データとして扱う
      // （説明行や記入例が残っていても表示に影響しないようにするため）
      .filter((item) => /^\d{4}$/.test(item.year));

    incomeLoaded = true;

    renderIncome();
  } catch (e) {
    console.error(e);
  }
}

function renderIncome() {
  document.getElementById("incomeYear").textContent = `${currentIncomeYear}年`;

  const list = allIncomeDocs.filter(
    (x) => Number(x.year) === currentIncomeYear
  );

  const tbody = document.getElementById("incomeTableBody");

  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `
    <tr>
      <td colspan="2" style="text-align:center">
      該当データがありません
      </td>
    </tr>
    `;
  } else {
    list.forEach((item) => {
      tbody.innerHTML += `
      <tr>

        <td>
         <a class="document-link" href="javascript:void(0)" data-pdf-url="${item.pdf}" onclick="openPdfViewer(this.dataset.pdfUrl)">
  ${item.title}
  <span class="material-icons">picture_as_pdf</span>
</a>
        </td>

        <td>${item.date}</td>

      </tr>
      `;
    });
  }
}

function renderIncomeWithLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "flex";

  setTimeout(() => {
    try {
      renderIncome();
    } catch (e) {
      console.error(e);
    } finally {
      if (overlay) overlay.style.display = "none";
    }
  }, 500);
}

document.getElementById("prevYearBtn").onclick = () => {
  // 掲載開始年より前へは行けない
  if (currentIncomeYear <= INCOME_START_YEAR) {
    return;
  }

  currentIncomeYear--;

  renderIncomeWithLoading();
};

document.getElementById("nextYearBtn").onclick = () => {
  // 今年分までしか進めない（掲載は翌年1月下旬予定）
  if (currentIncomeYear >= incomeToday.getFullYear()) {
    return;
  }

  currentIncomeYear++;

  renderIncomeWithLoading();
};

document.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    const loginPage = document.getElementById("loginPage");

    if (loginPage && loginPage.style.display !== "none") {
      // Loading表示
      document.getElementById("loadingOverlay").style.display = "flex";

      // ログイン実行
      login();
    }
  }
});
