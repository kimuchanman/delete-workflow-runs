const { parseWorkflowUrl, extractDeleteForms } = require("../content.js");

describe("parseWorkflowUrl", () => {
  it("正しいワークフローURL → { owner, repo, workflowFile } を返す", () => {
    const result = parseWorkflowUrl("/octocat/hello-world/actions/workflows/ci.yml");
    expect(result).toEqual({
      owner: "octocat",
      repo: "hello-world",
      workflowFile: "ci.yml",
    });
  });

  it("無関係なURL → null を返す", () => {
    expect(parseWorkflowUrl("/octocat/hello-world/pulls")).toBeNull();
    expect(parseWorkflowUrl("/")).toBeNull();
    expect(parseWorkflowUrl("")).toBeNull();
  });

  it("クエリパラメータ付きURL → 正しくパース", () => {
    const result = parseWorkflowUrl(
      "/owner/repo/actions/workflows/build.yml?query=branch%3Amain"
    );
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      workflowFile: "build.yml",
    });
  });
});

describe("extractDeleteForms", () => {
  function createDoc(html) {
    document.body.innerHTML = html;
    return document;
  }

  it("削除ダイアログ付きHTML → run IDとフォーム情報のMapを返す", () => {
    const doc = createDoc(`
      <dialog id="delete-workflow-run-12345">
        <form action="/owner/repo/actions/runs/12345">
          <input name="authenticity_token" value="token-abc" />
        </form>
      </dialog>
      <dialog id="delete-workflow-run-67890">
        <form action="/owner/repo/actions/runs/67890">
          <input name="authenticity_token" value="token-def" />
        </form>
      </dialog>
    `);

    const map = extractDeleteForms(doc);
    expect(map.size).toBe(2);
    expect(map.get("12345")).toEqual({
      action: "/owner/repo/actions/runs/12345",
      token: "token-abc",
    });
    expect(map.get("67890")).toEqual({
      action: "/owner/repo/actions/runs/67890",
      token: "token-def",
    });
  });

  it("ダイアログなしHTML → 空Mapを返す", () => {
    const doc = createDoc("<div>no dialogs here</div>");
    const map = extractDeleteForms(doc);
    expect(map.size).toBe(0);
  });

  it("不完全なダイアログ（tokenなし）→ スキップ", () => {
    const doc = createDoc(`
      <dialog id="delete-workflow-run-11111">
        <form action="/owner/repo/actions/runs/11111">
          <!-- no authenticity_token input -->
        </form>
      </dialog>
      <dialog id="delete-workflow-run-22222">
        <form action="/owner/repo/actions/runs/22222">
          <input name="authenticity_token" value="valid-token" />
        </form>
      </dialog>
    `);

    const map = extractDeleteForms(doc);
    expect(map.size).toBe(1);
    expect(map.has("11111")).toBe(false);
    expect(map.get("22222")).toEqual({
      action: "/owner/repo/actions/runs/22222",
      token: "valid-token",
    });
  });
});
