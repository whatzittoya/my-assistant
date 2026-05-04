import { Page } from "playwright";
import type { Post } from "@/types";
import { logger } from "@/lib/activity-log";

export async function scrapePosts(
  page: Page,
  discussionUrl: string,
  lecturerId?: string,
): Promise<Post[]> {
  const dId = discussionUrl.match(/[?&]d=(\d+)/)?.[1] ?? discussionUrl;
  logger.info(`Scraping discussion ${dId}`);
  await page.goto(discussionUrl, { waitUntil: "domcontentloaded" });
  await page
    .waitForSelector("[data-content='forum-post'][data-post-id], article[data-region='post']", {
      timeout: 15000,
    })
    .catch(() => null);

  const raw = await page.evaluate((lectId: string | undefined) => {
    function parseRating(postId: string): { rating: number | null; count: number | null } {
      const aggEl = document.getElementById(`ratingaggregate${postId}`);
      const cntEl = document.getElementById(`ratingcount${postId}`);
      const aggTxt = aggEl?.textContent?.trim() ?? "";
      const cntTxt = cntEl?.textContent?.trim() ?? "";
      const rating = aggTxt && /^\d+(\.\d+)?$/.test(aggTxt) ? Number(aggTxt) : null;
      const m = cntTxt.match(/\((\d+)\)/);
      const count = m ? Number(m[1]) : null;
      return { rating, count };
    }

    function isMine(author: string): boolean {
      if (!lectId) return false;
      const trail = author.match(/(\d+)\s*$/)?.[1] ?? "";
      return trail === lectId;
    }

    // Extract a single post from either a starter div.firstpost or a reply article.
    function parseNode(
      node: Element,
      parentPostId: string | null,
      depth: number,
    ): object | null {
      const postId = node.getAttribute("data-post-id") ?? "";
      if (!postId) return null;

      const core = node.querySelector("[data-region-content='forum-post-core']") ?? node;

      const subject =
        core.querySelector("[data-region-content='forum-post-core-subject']")
          ?.textContent?.trim() ?? "";

      const authorLink = core.querySelector("div.mb-3 a") as HTMLAnchorElement | null;
      const author = authorLink?.textContent?.trim() ?? "";
      const authorUrl = authorLink?.href ?? "";

      const datetimeIso =
        core.querySelector("time")?.getAttribute("datetime") ?? "";

      const contentEl = node.querySelector(`#post-content-${postId}`);
      const contentHtml = contentEl?.innerHTML?.trim() ?? "";

      const { rating, count } = parseRating(postId);

      return {
        postId,
        subject,
        author,
        authorUrl,
        datetimeIso,
        contentHtml,
        isMyPost: isMine(author),
        parentPostId,
        depth,
        rating,
        ratingCount: count,
      };
    }

    // Find the replies-container associated with a starter/article node.
    function findRepliesContainer(node: Element): Element | null {
      // For replies (article), the container is a direct child of the article.
      const inner = node.querySelector(":scope > div[data-region='replies-container']");
      if (inner) return inner;
      // For the starter, the container is usually a following sibling.
      let sib = node.nextElementSibling;
      while (sib) {
        if (sib.matches?.("div[data-region='replies-container']")) return sib;
        sib = sib.nextElementSibling;
      }
      // Final fallback: any replies-container under the same parent.
      return (
        node.parentElement?.querySelector(":scope > div[data-region='replies-container']") ?? null
      );
    }

    function extractTree(
      node: Element,
      parentPostId: string | null,
      depth: number,
    ): object[] {
      const post = parseNode(node, parentPostId, depth);
      if (!post) return [];
      const out: object[] = [post];
      const postId = (post as { postId: string }).postId;

      const container = findRepliesContainer(node);
      if (container) {
        const children = container.querySelectorAll(
          ":scope > article[data-region='post']",
        );
        for (const child of children) {
          out.push(...extractTree(child, postId, depth + 1));
        }
      }
      return out;
    }

    const all: object[] = [];

    // 1. Starter post: div.firstpost (or any element with class "firstpost" and data-post-id).
    const starter =
      document.querySelector(".firstpost[data-post-id]") ||
      document.querySelector("[data-content='forum-post'].firstpost");

    if (starter) {
      all.push(...extractTree(starter, null, 0));
    } else {
      // No starter detected: fall back to top-level articles as roots.
      const topArticles = document.querySelectorAll(
        "div[role='main'] article[data-region='post']:not(article[data-region='post'] article[data-region='post'])",
      );
      for (const a of topArticles) {
        all.push(...extractTree(a, null, 0));
      }
    }

    return all;
  }, lecturerId);

  const posts = raw as Array<Omit<Post, "iRepliedToThis">>;

  const myByParent = new Set(
    posts
      .filter((p) => p.isMyPost && p.parentPostId !== null)
      .map((p) => p.parentPostId as string),
  );

  const result: Post[] = posts.map((p) => ({
    ...p,
    iRepliedToThis: myByParent.has(p.postId),
  }));

  logger.ok(`Collected ${result.length} posts from discussion ${dId}`);
  return result;
}

export function hasMyReply(posts: Post[]): boolean {
  return posts.some((p) => p.isMyPost && p.parentPostId !== null);
}

// For nested session diskusi (single thread, many student roots):
// "replied" means every depth-1 non-me post has a direct child authored by me.
export function allStudentsAnswered(posts: Post[]): boolean {
  const studentRoots = posts.filter((p) => p.depth === 1 && !p.isMyPost);
  if (studentRoots.length === 0) return false;
  return studentRoots.every((s) =>
    posts.some((c) => c.parentPostId === s.postId && c.isMyPost),
  );
}
