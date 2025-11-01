import dotenv from "dotenv";
dotenv.config();

import {
  fetchLeetCodeSubmissions,
  fetchCodeforcesSubmissions,
} from "./src/fetchSubmissions.js";
import { pushToGitHub } from "./src/pushGithub.js";
import { pushToNotion } from "./src/pushNotion.js";
import { updateReadme } from "./src/updateReadme.js";
import { fetchAtCoderAcceptedSubmissions } from "./src/fetchAtCoderSubmission.js";

// ----------------- MAIN -----------------
async function run() {
  const leetcodeResults = await fetchLeetCodeSubmissions(
    process.env.LEETCODE_SESSION,
    process.env.LEETCODE_USERNAME
  );

  const codeforcesResults = await fetchCodeforcesSubmissions(
    process.env.CODEFORCE_USERNAME
  );

  const atcoderResults = await fetchAtCoderAcceptedSubmissions();

  const allResults = [...leetcodeResults, ...codeforcesResults, ...atcoderResults];

  // Push each file to GitHub & Notion
  for (const res of allResults) {
    const folder = res.fileName.includes("/") ? res.fileName.split("/")[0] : "";
    const fileName = res.fileName.includes("/")
      ? res.fileName.split("/")[1]
      : res.fileName;

    await pushToGitHub(folder, fileName, res.markdown, res.meta);
    await pushToNotion({
      title: res.title,
      markdown: res.markdown,
      meta: res.meta,
      tags: res.tags,
      problemUrl: res.problemUrl,
      submissionUrl: res.submissionUrl,
      difficulty: res.difficulty,
      platform: res.platform,
    });
  }

  // Update README directly from GitHub
  await updateReadme(allResults);

  console.log("\n🎉 All submissions processed and pushed!");
}

run();
