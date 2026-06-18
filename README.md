# WebComment MVP

WebComment 是一個 Chrome Extension-first 的網站標注協作工具。這個版本是不用 build 的 Manifest V3 MVP，可以直接在 Chrome 載入測試。

## 目前 MVP 功能

- 從 popup 或頁面工具列啟動標注模式。
- 點擊任何網頁位置建立 pin 標注。
- 在頁面上顯示 pin。
- 右側留言串抽屜與回覆功能。
- 標記已解決與重新開啟。
- 複製分享連結。
- 透過 page key 支援 localhost 與一般網址。
- 目前資料存在 `chrome.storage.local`，先支援單人本機測試。

## 本機載入 Extension

1. 打開 Chrome，前往 `chrome://extensions`。
2. 開啟 Developer Mode。
3. 點選 `Load unpacked`。
4. 選擇資料夾：`/Users/eleanorewu/Desktop/網頁標注工具`。
5. 開啟任何網站或 localhost app。
6. 打開 WebComment extension popup，點擊 `開始標注`。
7. 到網頁上點擊要標注的位置，輸入意見並送出。

## 測試 Demo Page

方式 A：直接開啟檔案。

1. 在 Chrome 開啟 `demo/test-page.html`。
2. 前往 `chrome://extensions`。
3. 打開 WebComment extension 詳細資料。
4. 開啟 `Allow access to file URLs`。
5. 重新整理 demo 頁。
6. 打開 extension popup，點擊 `開始標注`。

方式 B：用 localhost 開啟 demo。

```bash
python3 -m http.server 4173
```

接著打開：

```text
http://localhost:4173/demo/test-page.html
```

## Demo Page

也可以直接開啟本機 demo 檔案：

```text
/Users/eleanorewu/Desktop/網頁標注工具/demo/test-page.html
```

## 備註

第一版 MVP 先使用本機資料儲存，讓你可以不用架後端就測標注體驗。資料模型已經對齊 PRD，後續可以替換成 Supabase API。
