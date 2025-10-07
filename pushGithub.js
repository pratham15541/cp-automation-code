import axios from "axios";
export async function pushToGitHub(folder, fileName, content, meta) {
  const GITHUB_TOKEN = process.env.PERSONAL_GITHUB_TOKEN;
  const REPO = process.env.PERSONAL_GITHUB_REPO;
  const BRANCH = process.env.PERSONAL_GITHUB_BRANCH || "main";

  if (!GITHUB_TOKEN || !REPO) return console.error("❌ Missing GitHub credentials");

  // Fix: only prepend folder if it's non-empty
  const fullPath = folder ? `${folder}/${fileName}` : fileName;

  const base64Content = Buffer.from(content).toString("base64");

  let sha;
  try {
    const res = await axios.get(`https://api.github.com/repos/${REPO}/contents/${fullPath}`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
    });
    sha = res.data.sha;
  } catch (err) {
    sha = undefined;
  }

  const commitMessage = meta || `Add/Update ${fileName}`;

  try {
    await axios.put(
      `https://api.github.com/repos/${REPO}/contents/${fullPath}`,
      {
        message: commitMessage,
        content: base64Content,
        branch: BRANCH,
        sha,
      },
      {
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
      }
    );
    console.log(`✅ Pushed ${fullPath} to GitHub`);
  } catch (err) {
    console.error(`❌ Failed to push ${fullPath}:`, err.response?.data || err.message);
  }
}
