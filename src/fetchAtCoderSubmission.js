import axios from "axios";
import * as cheerio from "cheerio"; // FIX: Changed to namespace import
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const ATCODER_USERNAME = process.env.ATCODER_USERNAME;
const oneDayAgoEpochSeconds = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

const ATCODER_API_URL = `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${ATCODER_USERNAME}&from_second=${oneDayAgoEpochSeconds}`;

function formatSubmittedAt(epochSeconds) {
  const date = new Date(epochSeconds * 1000); // Convert seconds to milliseconds

  const YYYY = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, "0");
  const DD = String(date.getDate()).padStart(2, "0");
  const HH = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
}


export function cleanAtCoderMarkdown(md) {
    
    let cleaned = md.replace(
      
        /^#\s*([\s\S]*?)\n\s*---\n/s, 
        (match, titleBlock) => {
            
            const problemTitleMatch = titleBlock.match(/#\s*(.*?)\s*\n/);
            const problemTitle = problemTitleMatch ? `# ${problemTitleMatch[1].trim()}\n\n` : '';
            
            
            const metadataToKeep = [];
            const platformMatch = titleBlock.match(/\*\*Platform:\*\* (.*?)\s*$/m);
            if (platformMatch) metadataToKeep.push(`**Platform:** ${platformMatch[1].trim()}`);
            
            const authorMatch = titleBlock.match(/\*\*Author:\*\* (.*?)\s*$/m);
            if (authorMatch) metadataToKeep.push(`**Author:** ${authorMatch[1].trim()}`);

            const languageMatch = titleBlock.match(/\*\*Language:\*\* (.*?)\s*$/m);
          
            if (languageMatch) metadataToKeep.push(`**Language:** ${languageMatch[1].trim().replace('java24', 'Java')}`);
            
            const problemUrlMatch = titleBlock.match(/\*\*Problem URL:\*\* \[(.*?)\]\((.*?)\)/);
            if (problemUrlMatch) metadataToKeep.push(`**Problem URL:** [${problemUrlMatch[1]}](${problemUrlMatch[2]})`);

            const submissionUrlMatch = titleBlock.match(/\*\*Submission URL:\*\* \[(.*?)\]\((.*?)\)/);
            if (submissionUrlMatch) metadataToKeep.push(`**Submission URL:** [${submissionUrlMatch[1]}](${submissionUrlMatch[2]})`);

            const metadataBlock = metadataToKeep.length > 0 ? metadataToKeep.join(' \\| ') + '\n\n---\n\n' : '\n---\n\n';

            return problemTitle + metadataBlock;
        }
    );

   
    cleaned = cleaned.replace(/##\s*\n\s*<h3>(.*?)<\/h3>\s*\n\s*##\s*\n/gs, (match, title) => {
      
        return `## ${title.trim()}\n\n`;
    });

  
    cleaned = cleaned.replace(/^\s*##\s*$/gm, '');

  
    cleaned = cleaned.replace(/<div\s+class="io-style">\s*\n/g, '');
    cleaned = cleaned.replace(/<\/div>\s*\n/g, '');

  
    cleaned = cleaned.replace(
        /^(## Submitted Code\s*\n\s*```)java24([\s\S]*?)(\/\/ ======== FastScanner ========[\s\S]*?```)/gm,
        (match, pre, codeBlock, post) => {
            
            const fastScannerStart = codeBlock.indexOf('// ======== FastScanner ========');
            if (fastScannerStart !== -1) {
               
                const coreCode = codeBlock.substring(0, fastScannerStart).trim();
            
                return `${pre}java\n${coreCode}\n}\n`; 
            }
            return match; 
        }
    );
    
    // Fallback: Just replace the language tag if the full block wasn't matched
    cleaned = cleaned.replace(/```java24/g, '```java');

    // 6. Clean up remaining excessive newlines and leading/trailing whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Collapse more than two newlines to two
    cleaned = cleaned.trim();

    return cleaned;
}

export async function fetchAtCoderAcceptedSubmissions() {
  const results = [];

  console.log(`Fetching all submissions metadata for ${ATCODER_USERNAME}...`);
  let allSubmissions;
  try {
    const apiResponse = await axios.get(ATCODER_API_URL);
    allSubmissions = apiResponse.data;
  } catch (e) {
    console.error(
      "❌ FAILURE: Could not fetch from AtCoder API. Check username or network."
    );
    return [];
  }

  const acceptedSubmissions = allSubmissions.filter(
    (sub) => sub.result === "AC"
  );
  console.log(
    `✅ Found ${acceptedSubmissions.length} Accepted (AC) submissions to process.`
  );

  for (const sub of acceptedSubmissions) {
    try {
      const contestId = sub.contest_id;
      const problemId = sub.problem_id;

      const problemUrl = `https://atcoder.jp/contests/${contestId}/tasks/${problemId}`;
      const submissionUrl = `https://atcoder.jp/contests/${contestId}/submissions/${sub.id}`;

      const problemRes = await axios.get(problemUrl);
      const $p = cheerio.load(problemRes.data);

      const title = $p(".h2").text().trim() || $p("h2").first().text().trim();
      let statementHtml = null;

      // 1. Try to select English version (if there is e.g. a .lang-en or similar)
      const enBlock = $p("#task-statement .lang-en").html();
      if (enBlock) {
        statementHtml = enBlock;
      } else {
        // 2. fallback: maybe the first child is English or only Japanese
        statementHtml = $p("#task-statement").html();
      }

      const problemContent = statementHtml
        ? statementHtml
            .replace(/<div class="part">/g, "## ")
            .replace(/<\/div>/g, "\n")

            .replace(/\\(.*?\\)/g, (match) => match.replace(/\$/g, ""))
            .replace(/\s{2,}/g, "\n")
            .trim()
        : "Problem statement could not be scraped or selector changed.";

      const submissionRes = await axios.get(submissionUrl);
      const $s = cheerio.load(submissionRes.data);

      const codeRaw =
        $s("#submission-code").text().trim() ||
        "***ERROR: Code is private. Login required.***";

      const submittedAt = formatSubmittedAt(sub.epoch_second);
      const languageName = sub.language.split("(")[0].trim();
      const langForMarkdown = languageName.toLowerCase().startsWith("c++")
        ? "cpp"
        : languageName.toLowerCase().split(" ")[0];
      const difficulty = sub.difficulty ? sub.difficulty.toFixed(0) : "N/A";

      const markdown = `
# ${title} (AC)

**Platform:** AtCoder  

**Author:** ${ATCODER_USERNAME}  

**Submitted at:** ${submittedAt}

**Language:** ${languageName}  

**Runtime:** ${sub.execution_time ? sub.execution_time + "ms" : "N/A"}

**Memory:** ${
        sub.memory ? (sub.memory / 1024 / 1024).toFixed(2) + "MB" : "N/A"
      }  

**Problem URL:** [${problemUrl}](${problemUrl})  

**Submission URL:** [${submissionUrl}](${submissionUrl})  

---

## Problem Statement
${problemContent}

---

## Submitted Code
\`\`\`${langForMarkdown}
${codeRaw}
\`\`\`
`;

      results.push({
        title: title,
        fileName: `atcoder/${contestId}-${problemId}.md`,
        markdown: cleanAtCoderMarkdown(markdown),
        meta: `Runtime: ${
          sub.execution_time ? sub.execution_time + "ms" : "N/A"
        }, Memory: ${
          sub.memory ? (sub.memory / 1024 / 1024).toFixed(2) + "MB" : "N/A"
        }`,
        tags: [],
        problemUrl: problemUrl,
        submissionUrl: submissionUrl,
        difficulty: difficulty,
        platform: "AtCoder",
      });
    } catch (error) {
      console.error(
        `Skipping submission ${sub.id} due to an error:`,
        error.message
      );
    }
  }

  return results;
}