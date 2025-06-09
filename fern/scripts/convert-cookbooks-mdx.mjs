import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cookbooksJsonDir = path.join(__dirname, "./cookbooks-json");
const cookbooksMdxDir = path.join(__dirname, "./cookbooks-mdx");
await fs.mkdir(cookbooksMdxDir, { recursive: true });

const cookbooks = await fs.readdir(cookbooksJsonDir);

for (const cookbook of cookbooks) {
  const inputPath = path.join(cookbooksJsonDir, cookbook);
  const outputPath = path.join(
    cookbooksMdxDir,
    cookbook.replace(".json", ".mdx")
  );
  const cookbookJson = await fs.readFile(inputPath, "utf-8");
  const cookbookData = JSON.parse(cookbookJson);
  const str = `${cookbookData.custompage.body}`;

  const body = str.replaceAll(
    /\[block:html\](.*?)\[\/block\]/gs,
    (value, b) => {
      return JSON.parse(b.trim()).html;
    }
  );
  const cookbookMdx = `---
title: ${cookbookData.meta.title}
slug: /page/${cookbook.replace(".json", "")}
---

${body}
`;
  await fs.writeFile(outputPath, cookbookMdx);
}
