import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: process.env.PERSONAL_GITHUB_TOKEN
});

const [owner, repo] = process.env.PERSONAL_GITHUB_REPO.split("/");
const branch = process.env.PERSONAL_GITHUB_BRANCH || "main";

// ---------------- Fetch remote README ----------------
async function fetchRemoteReadme() {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: "README.md",
      ref: branch
    });

    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return { content, sha: data.sha }; // sha is needed to update
  } catch (err) {
    console.warn("⚠️ README.md not found remotely, starting fresh.");
    return { content: "", sha: null };
  }
}

// ---------------- Update README with tags matrix ----------------
export async function updateReadme(allResults) {
  const { content: oldContent, sha } = await fetchRemoteReadme();

  let newContent = "# Coding Submissions\n\n";

  ["leetcode", "codeforces"].forEach(folder => {
    newContent += `## ${folder.charAt(0).toUpperCase() + folder.slice(1)}\n\n`;

    const newResults = allResults.filter(r => r.fileName.startsWith(folder));

    // --- Collect tags ---
    const tagMap = {}; // tag -> list of problem links
    const problemSet = new Set();

    newResults.forEach(r => {
      const link = `[${r.title}](${r.fileName})`;
      problemSet.add(link);

      (r.tags || []).forEach(tag => {
        if (!tagMap[tag]) tagMap[tag] = [];
        tagMap[tag].push(link);
      });
    });

    const allTags = Object.keys(tagMap).sort();

    if (allTags.length) {
      // --- Header row ---
      newContent += "| " + allTags.join(" | ") + " |\n";
      newContent += "| " + allTags.map(_ => "---").join(" | ") + " |\n";

      // --- Find max problems under any tag ---
      const maxLen = Math.max(...Object.values(tagMap).map(arr => arr.length));

      for (let i = 0; i < maxLen; i++) {
        const row = allTags.map(tag => tagMap[tag][i] || "");
        newContent += "| " + row.join(" | ") + " |\n";
      }
      newContent += "\n";
    } else {
      // Fallback if no tags exist
      newResults.forEach(r => {
        const meta = r.meta ? ` - ${r.meta}` : "";
        newContent += `- [${r.title}](${r.fileName})${meta}\n`;
      });
      newContent += "\n";
    }
  });

  // ---------------- Push back to GitHub ----------------
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: "README.md",
    message: "Update README with latest submissions",
    content: Buffer.from(newContent, "utf-8").toString("base64"),
    branch,
    sha // required if updating existing file
  });

  console.log("✅ README.md updated on GitHub with tags matrix!");
}
