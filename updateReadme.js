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
    return { content, sha: data.sha };
  } catch (err) {
    console.warn("⚠️ README.md not found remotely, starting fresh.");
    return { content: "", sha: null };
  }
}

// ---------------- Build section for each platform ----------------
function buildSection(folder, newResults) {
  let section = `## ${folder.charAt(0).toUpperCase() + folder.slice(1)}\n\n`;

  const tagMap = {};
  newResults.forEach(r => {
    const link = `[${r.title}](${r.fileName})`;
    (r.tags || []).forEach(tag => {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push(link);
    });
  });

  const allTags = Object.keys(tagMap).sort();

  if (allTags.length) {
    section += "| " + allTags.join(" | ") + " |\n";
    section += "| " + allTags.map(() => "---").join(" | ") + " |\n";

    const maxLen = Math.max(...Object.values(tagMap).map(arr => arr.length));
    for (let i = 0; i < maxLen; i++) {
      const row = allTags.map(tag => tagMap[tag][i] || "");
      section += "| " + row.join(" | ") + " |\n";
    }
    section += "\n";
  } else {
    newResults.forEach(r => {
      const meta = r.meta ? ` - ${r.meta}` : "";
      section += `- [${r.title}](${r.fileName})${meta}\n`;
    });
    section += "\n";
  }

  return section;
}

// ---------------- Merge new sections into existing README ----------------
function mergeSections(oldContent, sections) {
  let newContent = oldContent;

  // ensure base heading exists
  if (!newContent.includes("# Coding Submissions"))
    newContent += "\n# Coding Submissions\n\n";

  for (const [folder, section] of Object.entries(sections)) {
    const pattern = new RegExp(
      `## ${folder.charAt(0).toUpperCase() + folder.slice(1)}[\\s\\S]*?(?=## |$)`,
      "i"
    );

    if (pattern.test(newContent)) {
      // replace existing section
      newContent = newContent.replace(pattern, section);
    } else {
      // append new section under main heading
      newContent += "\n" + section + "\n";
    }
  }

  return newContent.trim() + "\n";
}

// ---------------- Main update function ----------------
export async function updateReadme(allResults) {
  const { content: oldContent, sha } = await fetchRemoteReadme();

  const sections = {};
  ["leetcode", "codeforces"].forEach(folder => {
    const results = allResults.filter(r => r.fileName.startsWith(folder));
    sections[folder] = buildSection(folder, results);
  });

  const finalContent = mergeSections(oldContent, sections);

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: "README.md",
    message: "Update README with latest submissions (preserved)",
    content: Buffer.from(finalContent, "utf-8").toString("base64"),
    branch,
    sha
  });

  console.log("✅ README.md updated on GitHub (sections merged, old content preserved)");
}
