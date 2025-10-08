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
/**
 * Extracts a table section from the README and converts it back into the tagMap structure.
 * @param {string} content The full README content.
 * @param {string} folder The platform folder (e.g., 'leetcode').
 * @returns {object} The reconstructed tagMap.
 */
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

  // 1. Extract Tags (Columns)
  // Splits by '|', filters out empty strings, and trims to get tags
  const tags = headerRow
    .split("|")
    .map((h) => h.trim())
    .filter((h) => h.length > 0);

  if (tags.length === 0) return {};

  const tagMap = tags.reduce((acc, tag) => {
    acc[tag] = [];
    return acc;
  }, {});

  // 2. Extract Data (Rows)
  const rows = dataRows.split("\n");

  rows.forEach((row) => {
    // Splits by '|', filters out empty strings, and trims to get cells
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    tags.forEach((tag, index) => {
      // Push content if cell exists and is not empty
      const cellContent = cells[index] || "";
      if (cellContent.length > 0) {
        tagMap[tag].push(cellContent);
      }
    });
  });

  return tagMap;
}

// ---------------- Build section for each platform ----------------
/**
 * Builds a full tagMap from old parsed data and new results, then generates the section string.
 * This function now takes an existing tagMap and new results to MERGE.
 * @param {string} folder The platform folder (e.g., 'leetcode').
 * @param {object} existingTagMap The tagMap parsed from the old README.
 * @param {array} newResults The results from the current run.
 * @returns {string} The fully merged and formatted section string.
 */
function buildSection(folder, existingTagMap, newResults) {
  let section = `## ${folder.charAt(0).toUpperCase() + folder.slice(1)}\n\n`;

  // 1. Merge new results into the existing tag map
  const tagMap = { ...existingTagMap };

  newResults.forEach((r) => {
    const link = `[${r.title}](${r.fileName})`;
    (r.tags || []).forEach((tag) => {
      if (!tagMap[tag]) tagMap[tag] = []; // Create new column/tag
      tagMap[tag].push(link); // Append row/link to column
    });
  });

  const allTags = Object.keys(tagMap).sort();

  // 2. Build the table if there are tags
  if (allTags.length) {
    section += "| " + allTags.join(" | ") + " |\n";
    section += "| " + allTags.map(() => "---").join(" | ") + " |\n";

    const maxLen = Math.max(...Object.values(tagMap).map((arr) => arr.length));
    for (let i = 0; i < maxLen; i++) {
      const row = allTags.map((tag) => tagMap[tag][i] || "");
      section += "| " + row.join(" | ") + " |\n";
    }
    section += "\n";
  }
  // If no tags, fall back to simple list (though unlikely with existing content)
  else {
    newResults.forEach((r) => {
      const meta = r.meta ? ` - ${r.meta}` : "";
      section += `- [${r.title}](${r.fileName})${meta}\n`;
    });
    section += "\n";
  }

  return section;
}

// ---------------- Merge new sections into existing README (REPLACE/UPDATE) ----------------
/**
 * Merges the new sections by finding and replacing the existing sections.
 * @param {string} oldContent The existing content of README.md.
 * @param {object} sections An object where keys are platform folders and values are the new section strings.
 * @returns {string} The combined new content.
 */
function mergeSections(oldContent, sections) {
  let newContent = oldContent;

  // ensure base heading exists
  if (!newContent.includes("# Coding Submissions"))
    newContent += "\n# Coding Submissions\n\n";

  for (const [folder, section] of Object.entries(sections)) {
    const capitalizedFolder = folder.charAt(0).toUpperCase() + folder.slice(1);

    // Pattern to match the specific section from its heading to the next heading or end of file
    const pattern = new RegExp(
      `## ${capitalizedFolder}[\\s\\S]*?(?=## |$)`,
      "i"
    );

    if (pattern.test(newContent)) {
      // Replace existing section with the newly merged and regenerated one
      newContent = newContent.replace(pattern, section.trim());
    } else {
      // Append new section under main heading
      newContent += "\n\n" + section.trim() + "\n";
    }
  }

  return newContent.trim() + "\n";
}

// ---------------- Main update function ----------------
export async function updateReadme(allResults) {
  const { content: oldContent, sha } = await fetchRemoteReadme();

  const sections = {};

  // Process each platform (leetcode, codeforces)
  ["leetcode", "codeforces"].forEach((folder) => {
    // 1. Get existing data from README
    const existingTagMap = parseExistingSection(oldContent, folder);

    // 2. Filter new results for this platform
    const newResults = allResults.filter((r) => r.fileName.startsWith(folder));

    // 3. Merge existing data with new results and build the single, updated section
    sections[folder] = buildSection(folder, existingTagMap, newResults);
  });

  // 4. Replace the old sections in the README with the new merged sections
  const finalContent = mergeSections(oldContent, sections);

  // 5. Commit the change
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
