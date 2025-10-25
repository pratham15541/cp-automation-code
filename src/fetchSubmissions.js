// fetchSubmissions.js
import axios from "axios";
import { gotScraping } from "got-scraping";
import * as cheerio from "cheerio";

export function isFromYesterday(ts) {
  const date = new Date(ts * 1000);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  return (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  );
}

function isAbsoluteUrl(url) {
  return /^https?:\/\//i.test(url);
}

const formatSamples = (samples) => {
  const multi = samples.length > 1;

  return samples
    .map((sample, i) => {
      const index = multi ? ` ${i + 1}` : "";
      return (
        `### Sample Input${index}\n` +
        "```\n" +
        sample.input.trim() +
        "\n```\n\n" +
        `### Sample Output${index}\n` +
        "```\n" +
        sample.output.trim() +
        "\n```"
      );
    })
    .join("\n\n");
};

// Regular expression to identify Codeforces' LaTeX delimiters and capture the content
const CODEFORCES_MATH_REGEX = /\$\$+([\s\S]*?)\$\$+/g;

// --- Main Scraper Function ---

export async function fetchCodeforcesStatement(problemUrl) {
  try {
    const response = await gotScraping({ url: problemUrl });
    const $ = cheerio.load(response.body);

    const $statement = $("div.problem-statement").clone();

    // Extract sample inputs/outputs before removing them
    const samples = [];
    $statement.find(".sample-test").each((_, el) => {
      const inputs = [];
      const outputs = [];

      $(el)
        .find(".input pre")
        .each((_, inputEl) => {
          inputs.push($(inputEl).text().trim());
        });

      $(el)
        .find(".output pre")
        .each((_, outputEl) => {
          outputs.push($(outputEl).text().trim());
        });

      for (let i = 0; i < Math.max(inputs.length, outputs.length); i++) {
        samples.push({
          input: inputs[i] || "",
          output: outputs[i] || "",
        });
      }
    });

    // Clean the main statement
    $statement
      .find(
        ".header, .input-specification, .output-specification, .sample-test"
      )
      .remove();

    // Handle images
    $statement.find("img").each((i, el) => {
      let src = $(el).attr("src");
      if (src && !isAbsoluteUrl(src))
        src = `https://codeforces.com${src.startsWith("/") ? src : "/" + src}`;
      $(el).replaceWith(`![Image](${src})`);
    });

    let html = $statement.html() || "";

    // Normalize LaTeX, tags, etc.
    html = html
      .replace(CODEFORCES_MATH_REGEX, (_, p1) => `$${p1.trim()}$`)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li>/gi, "\n* ")
      .replace(/<\/li>/gi, "")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<p[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return {
      statement: html || "(No problem statement)",
      samples: samples.length ? samples : [{ input: "", output: "" }],
    };
  } catch (err) {
    console.error("⚠️ Failed to fetch Codeforces statement:", err.message);
    return {
      statement: "(Could not fetch problem statement)",
      samples: [],
    };
  }
}

// -------------------- LEETCODE --------------------

export async function fetchLeetCodeSubmissions(
  LEETCODE_SESSION,
  LEETCODE_USERNAME,
  metadata = null
) {
  const lcClient = axios.create({
    baseURL: "https://leetcode.com/graphql",
    headers: {
      "Content-Type": "application/json",
      Cookie: `LEETCODE_SESSION=${LEETCODE_SESSION}`,
    },
  });

  const queryRecent = `
    query recentACSubmissions($username: String!) {
      recentAcSubmissionList(username: $username, limit: 50) {
        id
        title
        titleSlug
        timestamp
        lang
      }
    }`;

  const queryDetail = `
    query submissionDetails($id: Int!) {
      submissionDetails(submissionId: $id) {
        id
        runtime
        runtimeDisplay
        memory
        memoryDisplay
        code
        lang { name verboseName }
      }
    }`;

  const queryQuestion = `
    query questionContent($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        content
        difficulty
        questionFrontendId
        topicTags { name slug }
      }
    }`;

  let submissions = [];
  try {
    const res = await lcClient.post("", {
      query: queryRecent,
      variables: { username: LEETCODE_USERNAME },
    });
    submissions = res.data.data.recentAcSubmissionList || [];
  } catch (err) {
    console.error("❌ Failed to fetch recent submissions:", err.message);
    return [];
  }

  submissions = submissions.filter((sub) => isFromYesterday(sub.timestamp));
  if (!submissions.length) return [];

  // Group by titleSlug
  const grouped = submissions.reduce((acc, sub) => {
    if (!acc[sub.titleSlug]) acc[sub.titleSlug] = [];
    acc[sub.titleSlug].push(sub);
    return acc;
  }, {});

  const results = [];

  for (const titleSlug of Object.keys(grouped)) {
    const subs = grouped[titleSlug];

    // Fetch details in parallel
    const detailedSubs = await Promise.all(
      subs.map(async (sub) => {
        try {
          const resDetail = await lcClient.post("", {
            query: queryDetail,
            variables: { id: parseInt(sub.id) },
          });
          return { ...sub, detail: resDetail.data.data.submissionDetails };
        } catch (err) {
          console.error(
            `❌ Failed to fetch details for ${sub.titleSlug}:`,
            err.message
          );
          return null;
        }
      })
    );

    const validSubs = detailedSubs.filter(Boolean);
    if (!validSubs.length) continue;

    // Pick the best runtime
    validSubs.sort((a, b) => a.detail.runtime - b.detail.runtime);
    const bestSub = validSubs[0];

    let question;
    let tags = [];

    // Use metadata fallback if available
    if (metadata && metadata[titleSlug]) {
      question = metadata[titleSlug];
      tags = question.topicTags?.map((t) => t.name) || [];
    } else {
      try {
        const resQuestion = await lcClient.post("", {
          query: queryQuestion,
          variables: { titleSlug },
        });
        question = resQuestion.data.data.question;
        tags = question.topicTags?.map((t) => t.name) || [];
      } catch (err) {
        console.warn(
          `⚠️ Could not fetch question metadata for ${titleSlug}, tags unknown`
        );
        question = {
          content: "Problem statement unavailable",
          difficulty: "Unknown",
          questionFrontendId: "NA",
        };
        tags = [];
      }
    }

    const submittedAt = new Date(bestSub.timestamp * 1000).toLocaleString();
    const submissionUrl = `https://leetcode.com/submissions/detail/${bestSub.id}/`;
    const problemUrl = `https://leetcode.com/problems/${titleSlug}/`;

    const markdown = `
# ${bestSub.title} (${question.difficulty})

**Platform:** LeetCode  

**Author:** Pratham Parikh (pratham15541)  

**Submitted at:** ${submittedAt}

**Language:** ${
      bestSub.detail.lang?.verboseName || bestSub.detail.lang?.name || "Unknown"
    }  

**Runtime:** ${bestSub.detail.runtimeDisplay || bestSub.detail.runtime} 

**Memory:** ${bestSub.detail.memoryDisplay || bestSub.detail.memory}  

**Problem URL:** [${problemUrl}](${problemUrl})  

**Submission URL:** [${submissionUrl}](${submissionUrl})  

---

## Problem Statement
${question.content}

---

## Submitted Code
\`\`\`${bestSub.detail.lang.name}
${bestSub.detail.code}
\`\`\`
`;

    results.push({
      title: bestSub.title,
      fileName: `leetcode/${
        question.questionFrontendId || "NA"
      }-${titleSlug}.md`,
      markdown,
      meta: `Time: ${
        bestSub.detail.runtimeDisplay || bestSub.detail.runtime
      }, Space: ${bestSub.detail.memoryDisplay || bestSub.detail.memory}`,
      tags,
      problemUrl: `https://leetcode.com/problems/${titleSlug}/`,
      submissionUrl: `https://leetcode.com/submissions/detail/${bestSub.id}/`,
      difficulty: question.difficulty,
      platform: "LeetCode", // ✅ Add this
    });
  }

  return results;
}

// -------------------- CODEFORCES --------------------

export async function fetchCodeforcesSubmissions(CODEFORCES_HANDLE) {
  const res = await axios.get(
    `https://codeforces.com/api/user.status?handle=${CODEFORCES_HANDLE}&from=1&count=100`
  );
  const allSubs = res.data.result || [];
  const accepted = allSubs.filter(
    (sub) => sub.verdict === "OK" && isFromYesterday(sub.creationTimeSeconds)
  );

  if (!accepted.length) return [];

  const grouped = {};
  for (const sub of accepted) {
    const key = `${sub.problem.contestId}-${sub.problem.index}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(sub);
  }

  const results = [];

  for (const key of Object.keys(grouped)) {
    const subs = grouped[key];
    subs.sort((a, b) => a.timeConsumedMillis - b.timeConsumedMillis);
    const bestSub = subs[0];
    const problem = bestSub.problem;

    const contestId = problem.contestId;
    const index = problem.index;
    const name = problem.name;
    const lang = bestSub.programmingLanguage;
    const verdict = bestSub.verdict;
    const time = bestSub.timeConsumedMillis;
    const memory = bestSub.memoryConsumedBytes;
    const submissionId = bestSub.id;
    const submittedAt = new Date(
      bestSub.creationTimeSeconds * 1000
    ).toLocaleString();

    const problemUrl = `https://codeforces.com/problemset/problem/${contestId}/${index}`;
    const submissionUrl = `https://codeforces.com/contest/${contestId}/submission/${submissionId}`;

    // 🔥 Fetch the actual problem statement
    const { statement, samples } = await fetchCodeforcesStatement(problemUrl);
    const problemStatement =
      statement + "\n\n" + formatSamples(samples);

    const markdown = `
# ${name} (${problem.rating || "Unrated"})

**Platform:** Codeforces  

**Author:** ${CODEFORCES_HANDLE}  

**Submitted at:** ${submittedAt}  

**Language:** ${lang}  

**Verdict:** ${verdict}  

**Time:** ${time} ms  

**Memory:** ${(memory / 1024).toFixed(1)} KB  

**Problem URL:** [${problemUrl}](${problemUrl})  

**Submission URL:** [${submissionUrl}](${submissionUrl})  

---

## Problem Statement
${problemStatement}

---

## Submitted Code
\`\`\`${lang.toLowerCase()}
(Your solution code goes here)
\`\`\`

---

## Problem Tags
${(problem.tags || []).map((t) => `- ${t}`).join("\n")}
`;

    const safeName = name.replace(/[^\w\s]/gi, "").replace(/\s+/g, "-");
    results.push({
      title: name,
      fileName: `codeforces/${contestId}-${index}-${safeName}.md`,
      markdown,
      meta: `Verdict: ${verdict}, Time: ${time} ms, Memory: ${(
        memory / 1024
      ).toFixed(1)} KB`,
      tags: problem.tags || [],
      problemUrl,
      submissionUrl,
      difficulty: problem.rating || "Unrated",
      platform: "Codeforces",
    });
  }

  return results;
}
