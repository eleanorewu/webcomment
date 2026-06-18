# AGENTS

## 回覆語言

請使用繁體中文回覆。

## Superpowers 工作流程

這個專案使用 Superpowers 作為 Codex 的主要開發工作流程。

開始任何 WebComment 相關任務時，先檢查是否有適用的 Superpowers skill，並依任務類型使用對應流程：

- 需求還不清楚或要規劃新功能時，先使用 `brainstorming`。
- 規格已確認、要拆實作步驟時，使用 `writing-plans`。
- 開始實作計畫時，依任務規模使用 `executing-plans` 或 `subagent-driven-development`。
- 修 bug 時，使用 `systematic-debugging`。
- 寫程式時，優先使用 `test-driven-development`，除非使用者明確指定不要。
- 完成變更前，使用 `verification-before-completion` 檢查結果真的可用。
- 需要檢查品質時，使用 `requesting-code-review`。
- 開發分支完成時，使用 `finishing-a-development-branch`。

Superpowers 流程是工作方式；使用者的明確指示與本專案既有規範仍然優先。

## Karpathy Guidelines

這個專案也採用 Karpathy-inspired guidelines 作為程式品質與協作準則。

這些 guidelines 是 Superpowers 工作流程的補充，不取代 Superpowers。Superpowers 決定「如何推進任務」，Karpathy guidelines 決定「如何避免常見 LLM coding 錯誤」。

進行撰寫、修改、重構或 review 程式碼時，遵守以下原則：

- Think Before Coding：不要靜默假設需求；如果有多種解讀，先說明差異與取捨。遇到不清楚、會影響實作方向或有產品風險的地方，先提出問題。
- Simplicity First：用能解決當前需求的最小設計，不加入未被要求的彈性、抽象、設定或功能。
- Surgical Changes：只改和任務直接相關的內容；不要順手重構、改格式、移除既有註解或清理無關 dead code。
- Goal-Driven Execution：把任務轉成可驗證的成功條件，完成前用測試、build、lint、手動檢查或文件檢查確認結果。

每一行重要改動都應該能追溯到使用者需求、專案規範或明確的驗證失敗。

## WebComment 專案規範

進行產品、技術、文件或 UI 決策前，先閱讀並遵守 `docs/AGENTS.md`。

`docs/AGENTS.md` 是 WebComment 產品方向、MVP 範圍、技術方向、anchor requirements、localhost requirements、UI guidelines、security/privacy、testing expectations 的主要規範入口。

## Source Of Truth

做產品或技術決策前，依序參考：

1. `docs/AGENTS.md`
2. `docs/01_PRD.md`
3. `docs/02_UX_FLOW.md`
4. `docs/03_INFORMATION_ARCHITECTURE.md`
5. `docs/08_TECH_SPEC.md`

`WebComment_PRD_v3.md` 只作為歷史來源材料。

## 工作原則

- 先確認任務屬於探索、規劃、實作、除錯、驗證或收尾，再選擇對應 Superpowers skill。
- 不要跳過驗證；完成前要能說明檢查過什麼。
- 變更範圍保持小而清楚，避免順手重構無關內容。
- 若需求有歧義，先列出假設與取捨；不要替使用者做高風險的靜默決定。
- 優先採用簡單、可讀、可驗證的方案，避免為未來可能性預先設計複雜架構。
- 若 Superpowers 建議與使用者明確指示衝突，以使用者指示為準。
