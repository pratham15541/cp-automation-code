// pushNotion.js
import dotenv from "dotenv";
import { Client } from "@notionhq/client";
import { htmlToNotion } from "html-to-notion-blocks";

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

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
    // ---- Extract useful info from markdown ----
    const codeBlockMatch = markdown.match(/```(\w+)?\n([\s\S]*?)```/);
    const codeLanguage = codeBlockMatch ? codeBlockMatch[1] || "java" : "java";
    const codeContent = codeBlockMatch ? codeBlockMatch[2].trim() : "";

    // 🔍 Extract the raw HTML part of the problem statement
    const problemStatementMatch = markdown.match(/## Problem Statement([\s\S]*?)---/);
    const problemStatementHtml = problemStatementMatch
      ? problemStatementMatch[1].trim()
      : "<p>No problem statement available.</p>";



    // ---- Convert HTML → Notion blocks ----
    const problemBlocks = await htmlToNotion(problemStatementHtml);

    // ---- Build Notion content ----
    const blocks = [
      {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ text: { content: "🧩 Problem Statement" } }] },
      },
      ...problemBlocks,
    ];

      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ text: { content: "💻 Submitted Code" } }] },
      });
      blocks.push({
        object: "block",
        type: "code",
        code: {
          language: codeLanguage,
          rich_text: [{ text: { content: codeContent || '' } }],
        },
      });
    

    // ---- Create Notion page ----
    await notion.pages.create({
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties: {
        Title: { title: [{ text: { content: title } }] },
        Platform: { select: { name: platform } },
        Difficulty: { select: { name: String(difficulty) } },
        Runtime: { rich_text: [{ text: { content:  meta } }] },
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
