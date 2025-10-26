# 🧠 CP Automation – LeetCode & Codeforces Tracker

This project automatically fetches your **LeetCode** and **Codeforces** submissions, updates a summary in your `README.md`, and syncs them to **GitHub** and **Notion** every night 🌙.

---

## ⚙️ How It Works

1. **Fetches submissions** from LeetCode and Codeforces using their APIs.  
2. **Generates summaries** (title, tags, difficulty, etc.).  
3. **Updates this README** automatically using a GitHub Action.  
4. **Sends updates** to a linked Notion database (optional).

---

## 🚀 Automation Setup

This project runs automatically using **GitHub Actions**.

### Environment Variables (Secrets)
You’ll need to add these secrets in your repository:

| Name | Description |
|------|--------------|
| `LEETCODE_SESSION` | Your LeetCode session cookie |
| `LEETCODE_USERNAME` | Your LeetCode username |
| `CODEFORCE_USERNAME` | Your Codeforces username |
| `PERSONAL_GITHUB_TOKEN` | Personal Access Token with `repo` permission |
| `PERSONAL_GITHUB_REPO` | Format: `username/repo-name` |
| `PERSONAL_GITHUB_BRANCH` | Usually `main` |
| `NOTION_TOKEN` | Notion API integration token |
| `NOTION_DATABASE_ID` | Target Notion database ID |

---

## 🕒 Schedule

The workflow runs automatically **every midnight (UTC)**  
and can also be triggered **manually** from the Actions tab.

---

## 🧩 Tech Stack

- **Node.js 20+**
- **GitHub Actions**
- **Octokit (GitHub API)**
- **Notion API**
- **Axios** for HTTP requests

---

# 🧮 Coding Submissions

## Leetcode

*(Auto-filled by script with problem list and tags)*

## Codeforces

*(Auto-filled by script with problem list and tags)*

---

## ✅ To-Do List

-   [ ] Add AI code best approach and explanation of both approach
-   [ ] AI time and space complexity analysis for both codes.
-   [ ] AI VIDEO GENERATION FOR BOTH CODE (GEMINI VEO) 
-   [ ] Add detailed statistics and visualizations of progress.
-   [ ] Improve error handling and notification system for failed runs.
-   [ ] Create a web interface for easier configuration and monitoring.

---

## 🧑‍💻 Author

**Pratham Parikh**  
⭐ Star this repo if you find it useful!

---

## 📄 License

This project is licensed under the **MIT License**.
