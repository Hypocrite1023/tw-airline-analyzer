# 免費雲端部署指南（GitHub Pages / Cloudflare Pages）

本專案已完整**純靜態化**，不需要後端伺服器、不會連到你的本機電腦、**永久 0 元免費**，且內建 GitHub Actions，**每個月 26 號會自動抓取台灣民航局最新月報並重新發佈網站**。

---

## 方法一：GitHub Pages（最簡單、含每月全自動更新）

只要 3 個步驟：

### 步驟 1：建立 GitHub Repository 並推送程式碼
1. 到 [github.com/new](https://github.com/new) 建立一個新的 **Public（公開）** Repository，名稱可取 `tw-airline-analyzer`（不要勾選 Add README）。
2. 在本專案資料夾打開終端機執行：
   ```bash
   git init
   git add .
   git commit -m "Initial commit: TW Airline Analyzer"
   git branch -M main
   git remote add origin https://github.com/<你的GitHub帳號>/tw-airline-analyzer.git
   git push -u origin main
   ```

### 步驟 2：開啟 GitHub Pages
1. 打開你的 GitHub Repository 頁面 → 點選上方 **Settings** → 左側選單 **Pages**。
2. 在 **Build and deployment → Source** 下拉選單選擇：**`GitHub Actions`**。

### 步驟 3：等待 2 分鐘，公開網址上線！
* 點選上方 **Actions** 分頁，可以看到 `Build & Deploy TW Airline Analyzer to GitHub Pages` 正在自動抓取民航局全部 18 年數據並建置網站。
* 綠燈完成後，你的公開網址就會出現在頁面中：
  👉 `https://<你的GitHub帳號>.github.io/tw-airline-analyzer/`

> **之後完全不用管它！** 每個月 26 號上午 10:00（台灣時間），GitHub 會自動幫你抓最新月份的民航局載客率、貨運量與準點率並更新網頁；你也可以隨時到 **Actions** 分頁按 **Run workflow** 手動立即更新。

---

## 方法二：Cloudflare Pages（不限流量、全球 CDN 秒開）

如果想要更快的全球 CDN 或自訂網域：
1. 本機已經建置好純靜態資料夾 `web/dist/`（包含全部 18 年靜態 JSON 資料）。
2. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Upload assets**（直接把 `web/dist` 資料夾拖曳上傳），10 秒鐘就拿到免費 `https://xxx.pages.dev` 公開網址！
