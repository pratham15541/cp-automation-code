// pushNotion.js
import dotenv from "dotenv";
import { Client } from "@notionhq/client";
import { htmlToNotion } from "html-to-notion-blocks";
import { markdownToBlocks } from "@tryfabric/martian";
import he from "he";

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// ---- Helper: Notion-safe paragraph splitting ----
function createNotionTextBlocks(text) {
  const MAX_CHARS = 2000;
  const blocks = [];
  for (let i = 0; i < text.length; i += MAX_CHARS) {
    const chunk = text.slice(i, i + MAX_CHARS);
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: chunk } }],
      },
    });
  }
  return blocks;
}

// ---- Helper: Adaptive code block creation ----
// If total code ≤ 16k chars → one merged block
// Else → multiple visually continuous blocks
function createAdaptiveCodeBlocks(code, language = "java") {
  const MAX_CHARS = 2000;
  const MAX_SAFE_LENGTH = 16000;

  // ✅ Case 1: Small code → merge into one block
  if (code.length <= MAX_SAFE_LENGTH) {
    const richTextSegments = [];
    for (let i = 0; i < code.length; i += MAX_CHARS) {
      const chunk = code.slice(i, i + MAX_CHARS);
      richTextSegments.push({
        type: "text",
        text: { content: chunk },
      });
    }

    return [
      {
        object: "block",
        type: "code",
        code: {
          language,
          rich_text: richTextSegments,
        },
      },
    ];
  }

  // ⚙️ Case 2: Large code → split into multiple blocks with continuation marker
  const blocks = [];
  for (let i = 0; i < code.length; i += MAX_CHARS) {
    const chunk = code.slice(i, i + MAX_CHARS);
    const prefix = i === 0 ? "" : "⤷ continued\n";
    blocks.push({
      object: "block",
      type: "code",
      code: {
        language,
        rich_text: [{ type: "text", text: { content: prefix + chunk } }],
      },
    });
  }

  return blocks;
}

export async function pushToNotion(submission) {
  const {
    title,
    markdown = "",
    meta = "",
    tags = [],
    problemUrl,
    submissionUrl,
    platform = "Unknown",
    difficulty = "Unknown",
  } = submission;

  try {
    // ---- Extract submitted code ----
    const codeBlockMatch = markdown.match(/## Submitted Code\s*```(\w+)?\n([\s\S]*?)```/);
    const codeLanguage = codeBlockMatch ? codeBlockMatch[1] || "java" : "java";
    const codeContent = codeBlockMatch ? codeBlockMatch[2].trim() : "";

    // ---- Extract problem statement ----
    const problemStatementMatch = markdown.match(/## Problem Statement([\s\S]*?)(?=## Submitted Code|---)/);
    let problemStatementRaw = problemStatementMatch
      ? problemStatementMatch[1].trim()
      : "No problem statement available.";

    // Decode HTML entities
    problemStatementRaw = he.decode(problemStatementRaw);

    // ---- Detect HTML vs Markdown ----
    const isHtml = /<[^>]+>/.test(problemStatementRaw);

    let problemBlocks = [];
    if (isHtml) {
      problemBlocks = await htmlToNotion(problemStatementRaw);
    } else if (problemStatementRaw && problemStatementRaw !== "No problem statement available.") {
      problemBlocks = markdownToBlocks(problemStatementRaw, { enableEmojiCallouts: true });
    }

    // ---- Enforce Notion text size limits on paragraph blocks ----
    const safeProblemBlocks = problemBlocks.flatMap((block) => {
      if (
        block.type === "paragraph" &&
        block.paragraph.rich_text[0]?.text?.content?.length > 2000
      ) {
        return createNotionTextBlocks(block.paragraph.rich_text[0].text.content);
      }
      return [block];
    });

    // ---- Final Notion children blocks ----
    const blocks = [
      {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ text: { content: "🧩 Problem Statement" } }] },
      },
      ...safeProblemBlocks,
      {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ text: { content: "💻 Submitted Code" } }] },
      },
      ...createAdaptiveCodeBlocks(codeContent, codeLanguage),
    ];

    // ---- Push to Notion ----
    await notion.pages.create({
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties: {
        Title: { title: [{ text: { content: title } }] },
        Platform: { select: { name: platform } },
        Difficulty: { select: { name: String(difficulty) } },
        Runtime: { rich_text: [{ text: { content: meta } }] },
        Tags: { multi_select: tags.map((t) => ({ name: t })) },
        "Problem URL": problemUrl ? { url: problemUrl } : undefined,
        "Submission URL": submissionUrl ? { url: submissionUrl } : undefined,
      },
      children: blocks,
    });

    console.log(`✅ Added to Notion: ${title}`);
  } catch (err) {
    console.error(`❌ Failed to push ${title} to Notion:`, err.message);
  }
}
