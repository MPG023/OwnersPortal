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

// 読んだお知らせ（アカウントごとにFirestoreへ保存し、端末をまたいで共有する）
let readNotices = [];
let currentUserUid = null;

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
    address: "長野県塩尻市 広丘原新田 ２０６－１３ ",
    owner: "小松 　宗夫",

    contract: "フルパッケージ",
    office: "松本",
    staff: "鈴木  　康治",
    inspectionDate: "2026/06/17",
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
    address: "長野県塩尻市　広丘原新田２０６－１",
    owner: "小松 　宗夫",

    contract: "自主管理/一部不動産仲介",
    office: "-",
    staff: "小松　泰輝",
    salesstaff: "-",
    inspectionDate: "2026/07/30",
    cleaningDate: "2026/07/17",
    contractDate: "-",
    completion: "1982/10/11",
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

  auth
    .signInWithEmailAndPassword(email, password)
    .then(() => {
      // ログイン情報を記憶する設定に応じて、端末に保存／削除する
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
        localStorage.setItem("rememberedPassword", password);
      } else {
        localStorage.removeItem("rememberedEmail");
        localStorage.removeItem("rememberedPassword");
      }
    })
    .catch((error) => {
      alert("ログイン失敗\n" + error.message);
    });
}

// ページ読み込み時、記憶されたログイン情報があれば入力欄に復元する
function restoreRememberedLogin() {
  const email = localStorage.getItem("rememberedEmail");
  const password = localStorage.getItem("rememberedPassword");

  if (email && password) {
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const rememberCheckbox = document.getElementById("rememberMeCheckbox");

    if (emailInput) emailInput.value = email;
    if (passwordInput) passwordInput.value = password;
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

firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    console.log("UID:", user.uid);

    localStorage.setItem("loggedIn", "true");
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("portal").style.display = "block";

    currentUserUid = user.uid;

    loadUserProfile(user);
    await loadReadNotices(user.uid); // 既読状態を先に読み込んでから
    loadNotices();
    loadPayments();
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
                onclick="event.stopPropagation();openPhotoMenu();">
                建物に関する写真
                </button>
                `
                : ""
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

//https://docs.google.com/spreadsheets/d/e/2PACX-1vT9P-7ACLUYEm4nSO5C41hW1uCC90zcJ72KsxWWmL8qNkXmBY_sgFPe3QS9ht6TEQizOhJ1CZvkhZ0L/pub?output=csv

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

function hideAllPages() {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("active");
    page.scrollTop = 0;
  });

  window.scrollTo(0, 0);
}

function openNotice(title, date, body) {
  showPage("noticeDetailPage");

  document.getElementById("detailTitle").textContent = title;
  document.getElementById("detailDate").textContent = date;
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
    const url =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vT9P-7ACLUYEm4nSO5C41hW1uCC90zcJ72KsxWWmL8qNkXmBY_sgFPe3QS9ht6TEQizOhJ1CZvkhZ0L/pub?output=csv";

    const res = await fetch(url);
    const text = await res.text();

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
        ? `https://${file}`
        : file;

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
      ${date} ${pdfIcon} ${newBadge}
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
          openNotice(title, date, body, file);
        }
      };

      list.appendChild(item);
    });
  } catch (e) {
    console.error(e);
    list.innerHTML = "読み込みに失敗しました。";
  }
}

function openPhotoMenu() {
  const menu = document.getElementById("photo-menu");
  if (menu) menu.style.display = "flex";
}

function closePhotoMenu() {
  const menu = document.getElementById("photo-menu");
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

const INSPECTION_BASIC_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTmKWppOFkClZacdH7ksEZj0eCKR7cR2udubyJ6RsyRwhvtO4eC5Bed12_x9qC3EeSsDp1dWDaoncSg/pub?gid=546818343&single=true&output=csv";
const INSPECTION_CHECK_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTmKWppOFkClZacdH7ksEZj0eCKR7cR2udubyJ6RsyRwhvtO4eC5Bed12_x9qC3EeSsDp1dWDaoncSg/pub?gid=618653207&single=true&output=csv";
const INSPECTION_PHOTO_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTmKWppOFkClZacdH7ksEZj0eCKR7cR2udubyJ6RsyRwhvtO4eC5Bed12_x9qC3EeSsDp1dWDaoncSg/pub?gid=2127589159&single=true&output=csv";
const INSPECTION_SECTION_NOTE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTmKWppOFkClZacdH7ksEZj0eCKR7cR2udubyJ6RsyRwhvtO4eC5Bed12_x9qC3EeSsDp1dWDaoncSg/pub?gid=2030197791&single=true&output=csv";
const INSPECTION_SUMMARY_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTmKWppOFkClZacdH7ksEZj0eCKR7cR2udubyJ6RsyRwhvtO4eC5Bed12_x9qC3EeSsDp1dWDaoncSg/pub?gid=1410807225&single=true&output=csv";
const INSPECTION_OCCUPANCY_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTmKWppOFkClZacdH7ksEZj0eCKR7cR2udubyJ6RsyRwhvtO4eC5Bed12_x9qC3EeSsDp1dWDaoncSg/pub?gid=1707019712&single=true&output=csv";

let inspectionDataLoaded = false;

let inspectionData = {
  basic: [],
  check: [],
  photo: [],
  sectionNote: [],
  summary: [],
  occupancy: []
};

async function fetchInspectionCSV(url) {
  if (!url) return [];

  try {
    const res = await fetch(url);
    const text = await res.text();
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
    fetchInspectionCSV(INSPECTION_BASIC_CSV_URL),
    fetchInspectionCSV(INSPECTION_CHECK_CSV_URL),
    fetchInspectionCSV(INSPECTION_PHOTO_CSV_URL),
    fetchInspectionCSV(INSPECTION_SECTION_NOTE_CSV_URL),
    fetchInspectionCSV(INSPECTION_SUMMARY_CSV_URL),
    fetchInspectionCSV(INSPECTION_OCCUPANCY_CSV_URL)
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
// シート作成後、「ファイル」→「共有」→「ウェブに公開」からCSV形式のリンクを発行し、
// 下記 DOCUMENT_SHEET_URL に貼り付けてください。以降はスプレッドシートに行を追加するだけで
// この画面にPDFを追加できます。
const DOCUMENT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vT03moDNQbyFv6NXh6aJQfh4ARtCz1ZhDAHUt9tSAv_q64LzqEhHri5gY1dGAZZT769hC6tXqD9z-nq/pub?output=csv";

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
// 下記 RECRUIT_STATUS_CSV_URL に貼り付けてください。以降はスプレッドシートに行を追加・編集する
// だけで、この画面の内容がそのまま更新されます。
const RECRUIT_STATUS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTCOJlP1LCWBg4F-ZnGJEdaqoBuGdCXBnJXq5ksVj0Y1IQoEwn_WL2FiFlhhmyl10_duTF7pck6cvvU/pub?output=csv";

let recruitStatusData = [];
let recruitStatusLoaded = false;

async function loadRecruitStatus(buildingName) {
  if (!recruitStatusLoaded) {
    try {
      const res = await fetch(RECRUIT_STATUS_CSV_URL);
      const text = await res.text();
      recruitStatusData = parseCSV(text).slice(1); // ヘッダー行を除く
      recruitStatusLoaded = true;
    } catch (e) {
      console.error("募集状況データの取得に失敗しました：", e);
      recruitStatusData = [];
    }
  }

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

async function loadDocuments(buildingName) {
  const tbody = document.getElementById("documentList");
  const nameEl = document.getElementById("documentBuildingName");
  if (!tbody) return;

  if (nameEl) nameEl.textContent = buildingName;

  tbody.innerHTML = `<tr><td colspan="3">読み込み中...</td></tr>`;

  try {
    const res = await fetch(DOCUMENT_SHEET_URL);
    const text = await res.text();

    const rows = parseCSV(text).slice(1);

    // 建物名で絞り込み、カテゴリごとにグループ化（シートの登場順を維持）
    const categories = [];
    const categoryMap = {};

    rows.forEach((c) => {
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

async function loadRepair(buildingName) {
  const tbody = document.getElementById("repairTable");
  if (!tbody) return;

  tbody.innerHTML = "";

  const url =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQLlA4QT08WxplwL7WcuiJ9RRO2YA-_dcw-h1UDYvMBKolzNzUE0RG5ia1SvhF9H5R_phnIgOHhE8ik/pub?output=csv";

  try {
    const res = await fetch(url);
    const text = await res.text();

    const rows = parseCSV(text).slice(1);

    rows.reverse().forEach((c) => {
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

// Googleドライブの共有リンク（/view）を埋め込み表示用（/preview）に変換する
function toEmbeddablePdfUrl(url) {
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (match) {
    return `https://drive.google.com/file/d/${match[1]}/preview`;
  }
  return url;
}

// 新規タブでブラウザ標準のPDFビューア（Chromeの場合はスクリーンショットのような画面）が
// 開くよう、Googleドライブの共有リンクをPDF本体への直リンクに変換する
function toDirectPdfUrl(url) {
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (match) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  return url;
}

let currentPdfBlobUrl = null; // 表示中の生成PDFのBlob URL（閉じるときに解放するため）

function showPdfInViewer(url) {
  const modal = document.getElementById("pdfViewerModal");
  const holder = document.getElementById("pdfViewerFrameHolder");
  if (!modal || !holder) return;

  // 表示する瞬間だけ、まず「PDFを作成中です」の読み込み表示を出す
  holder.innerHTML = `
    <div id="pdfViewerLoading" class="pdf-viewer-loading">
      <div class="pdf-viewer-spinner"></div>
      <p>PDFを作成中です…</p>
    </div>
  `;

  modal.classList.add("open");

  const frame = document.createElement("iframe");
  frame.id = "pdfViewerFrame";
  frame.title = "PDFプレビュー";
  frame.style.display = "none"; // 読み込み完了まで隠しておく
  frame.src = url;

  frame.onload = () => {
    const loading = document.getElementById("pdfViewerLoading");
    if (loading) loading.remove();
    frame.style.display = "block";
  };

  holder.appendChild(frame);
}

// Googleドライブ等、既存のPDFファイルを開く場合
function openPdfViewer(url) {
  if (!url) return;
  showPdfInViewer(toEmbeddablePdfUrl(url));
}

// 明細データから、その場でPDFを組み立てて表示する（ファイルの保存先を持たない）
async function openGeneratedReceiptPdf({ title, date, price }) {
  const template = document.getElementById("receiptTemplate");
  if (!template) return;

  document.getElementById("receiptTitle").textContent = title || "";
  document.getElementById("receiptDate").textContent = date || "";
  document.getElementById("receiptPrice").textContent = price
    ? `${Number(price).toLocaleString()}円`
    : "";

  // 先にモーダルとローディング表示だけ出しておく
  const modal = document.getElementById("pdfViewerModal");
  const holder = document.getElementById("pdfViewerFrameHolder");
  if (!modal || !holder) return;

  holder.innerHTML = `
    <div id="pdfViewerLoading" class="pdf-viewer-loading">
      <div class="pdf-viewer-spinner"></div>
      <p>PDFを作成中です…</p>
    </div>
  `;
  modal.classList.add("open");

  try {
    // 日本語を含むレイアウトを画像として描画（jsPDFは日本語フォント非対応のため）
    const canvas = await html2canvas(template, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      unit: "px",
      format: [canvas.width, canvas.height]
    });
    pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);

    const blobUrl = pdf.output("bloburl");
    currentPdfBlobUrl = blobUrl;

    showPdfInViewer(blobUrl);
  } catch (e) {
    console.error("明細PDFの生成に失敗しました：", e);
    holder.innerHTML = `
      <div class="pdf-viewer-loading">
        <p>PDFの作成に失敗しました。もう一度お試しください。</p>
      </div>
    `;
  }
}

function closePdfViewer() {
  const modal = document.getElementById("pdfViewerModal");
  const holder = document.getElementById("pdfViewerFrameHolder");

  if (modal) modal.classList.remove("open");
  if (holder) holder.innerHTML = ""; // iframeごと消して読み込みを止める

  // その場で作ったPDFのBlob URLはもう不要なので解放する
  if (currentPdfBlobUrl) {
    URL.revokeObjectURL(currentPdfBlobUrl);
    currentPdfBlobUrl = null;
  }
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
  const res = await fetch(`${API_URL}?idToken=${encodeURIComponent(idToken)}`);
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
    window.__paymentListForPdf = list; // 生成PDFで参照するため保持
    list.forEach((item, idx) => {
      total += Number(item.price);

      tbody.innerHTML += `
      <tr>

        <td>
         <a class="document-link" href="javascript:void(0)" onclick="openGeneratedReceiptPdf(window.__paymentListForPdf[${idx}])">
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

  document.getElementById("prevMonthBtn").disabled = false;
  document.getElementById("nextMonthBtn").disabled = false;
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

// 年間収支内訳書：公開スプレッドシート（CSV）
const INCOME_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTPiWTSDoV1Zlhil3bDLyMJs683ge2kfri_57aUcnTJOedOp7kLmcqm3lrfR7ynreiJ6bUKK4v3NOwE/pub?output=csv";

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
    const res = await fetch(INCOME_CSV_URL);
    const text = await res.text();

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