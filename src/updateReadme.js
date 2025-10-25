import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: process.env.PERSONAL_GITHUB_TOKEN,
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
      ref: branch,
    });

    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return { content, sha: data.sha };
  } catch (err) {
    console.warn("⚠️ README.md not found remotely, starting fresh.");
    return { content: "", sha: null };
  }
}

// ---------------- Parse existing section table into a tagMap ----------------
function parseExistingSection(content, folder) {
  const capitalizedFolder = folder.charAt(0).toUpperCase() + folder.slice(1);
  const pattern = new RegExp(
    `## ${capitalizedFolder}\\s*\\n\\n\\|([\\s\\S]*?)\\|\\s*\\n\\|\\s*---[\\s\\S]*?\\|\\s*\\n([\\s\\S]*?)(?=## |$)`,
    "i"
  );

  const match = content.match(pattern);
  if (!match) return {}; // No table found

  const headerRow = match[1].trim();
  const dataRows = match[2].trim();

  const tags = headerRow
    .split("|")
    .map((h) => h.trim())
    .filter((h) => h.length > 0);

  if (tags.length === 0) return {};

  const tagMap = tags.reduce((acc, tag) => {
    acc[tag] = [];
    return acc;
  }, {});

  const rows = dataRows.split("\n");

  rows.forEach((row) => {
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    tags.forEach((tag, index) => {
      const cellContent = cells[index] || "";
      if (cellContent.length > 0) {
        tagMap[tag].push(cellContent);
      }
    });
  });

  return tagMap;
}

// ---------------- Build section for each platform ----------------
function buildSection(folder, existingTagMap, newResults) {
  let section = `## ${folder.charAt(0).toUpperCase() + folder.slice(1)}\n\n`;

  // Merge new results into the existing tag map
  const tagMap = { ...existingTagMap };

  newResults.forEach((r) => {
    const link = `[${r.title}](${r.fileName})`;
    (r.tags || []).forEach((tag) => {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push(link);
    });
  });

  const allTags = Object.keys(tagMap).sort();

  // Build the table if there are tags
  if (allTags.length) {
    section += "| " + allTags.join(" | ") + " |\n";
    section += "| " + allTags.map(() => "---").join(" | ") + " |\n";

    const maxLen = Math.max(...Object.values(tagMap).map((arr) => arr.length));
    for (let i = 0; i < maxLen; i++) {
      const row = allTags.map((tag) => tagMap[tag][i] || "");
      section += "| " + row.join(" | ") + " |\n";
    }
    section += "\n";
  } else {
    // No tags yet
    section += "_No submissions yet._\n\n";
  }

  return section;
}

// ---------------- Merge new sections into existing README ----------------
function mergeSections(oldContent, sections) {
  let newContent = oldContent;

  // Ensure base heading exists
  if (!newContent.includes("# Coding Submissions"))
    newContent += "\n# Coding Submissions\n\n";

  for (const [folder, section] of Object.entries(sections)) {
    const capitalizedFolder = folder.charAt(0).toUpperCase() + folder.slice(1);

    const pattern = new RegExp(
      `## ${capitalizedFolder}[\\s\\S]*?(?=## |$)`,
      "i"
    );

    if (pattern.test(newContent)) {
      newContent = newContent.replace(
        pattern,
        section.trim().replace(/\n*$/, "\n\n")
      );
    } else {
      // Ensure proper spacing before new section
      newContent = newContent.replace(/\n*$/, "\n\n") + section.trim() + "\n\n";
    }
  }

  return newContent.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ---------------- Main update function ----------------
export async function updateReadme(allResults) {
  const { content: oldContent, sha } = await fetchRemoteReadme();
  const sections = {};

  ["leetcode", "codeforces"].forEach((folder) => {
    const existingTagMap = parseExistingSection(oldContent, folder);

    // ✅ Case-insensitive folder match fix
    const newResults = allResults.filter((r) =>
      new RegExp(`^${folder}`, "i").test(r.fileName)
    );

    sections[folder] = buildSection(folder, existingTagMap, newResults);
  });

  const finalContent = mergeSections(oldContent, sections);

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: "README.md",
    message: "Update README: Merged new submissions into existing tables",
    content: Buffer.from(finalContent, "utf-8").toString("base64"),
    branch,
    sha,
  });

  console.log(
    "✅ README.md updated on GitHub (new submissions merged into existing tables)"
  );
}
