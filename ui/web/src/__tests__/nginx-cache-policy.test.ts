import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const nginxConfig = readFileSync(resolve(process.cwd(), "nginx.conf"), "utf8");

function locationBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = nginxConfig.match(
    new RegExp(`^    location ${escapedSelector} \\{\\n([\\s\\S]*?)^    \\}`, "m"),
  );

  expect(match, `location ${selector} should exist`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("Nginx web cache policy", () => {
  it("prevents browsers from caching the entry document", () => {
    const index = locationBlock("= /index.html");

    expect(index).toContain(
      'add_header Cache-Control "no-cache, no-store, must-revalidate";',
    );
    expect(index).toContain('add_header Pragma "no-cache";');
    expect(index).toContain('add_header Expires "0";');
    expect(index).toContain("try_files $uri =404;");
  });

  it("routes client-side paths through the entry-document policy", () => {
    expect(locationBlock("/")).toContain("try_files $uri $uri/ /index.html;");
    expect(nginxConfig.indexOf("location = /index.html")).toBeLessThan(
      nginxConfig.indexOf("location / {"),
    );
  });

  it("keeps content-addressed assets cached immutably for one year", () => {
    const assets = locationBlock("/assets/");

    expect(assets).toContain("expires 1y;");
    expect(assets).toContain('add_header Cache-Control "public, immutable";');
  });

  it("keeps backend proxy routes separate from the SPA fallback", () => {
    expect(locationBlock("/ws")).toContain("proxy_pass $upstream_backend;");
    expect(locationBlock("/v1/")).toContain("proxy_pass $upstream_backend;");
    expect(locationBlock("/health")).toContain("proxy_pass $upstream_backend;");
  });
});
