"use strict";

// --- Pure functions (testable) ---

function parseWorkflowUrl(pathname) {
  const path = pathname || (typeof location !== "undefined" ? location.pathname : "");
  const match = path.match(
    /^\/([^/]+)\/([^/]+)\/actions\/workflows\/([^/?]+)/
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2], workflowFile: match[3] };
}

function extractDeleteForms(doc) {
  const map = new Map();
  const dialogs = doc.querySelectorAll('dialog[id^="delete-workflow-run-"]');
  for (const dialog of dialogs) {
    const m = dialog.id.match(/^delete-workflow-run-(\d+)$/);
    if (!m) continue;
    const runId = m[1];
    const form = dialog.querySelector("form");
    if (!form) continue;
    const tokenInput = form.querySelector('input[name="authenticity_token"]');
    if (!tokenInput) continue;
    map.set(runId, {
      action: form.getAttribute("action"),
      token: tokenInput.value,
    });
  }
  return map;
}

// --- Browser runtime ---

if (typeof document !== "undefined" && document.body) {
  (() => {
    const BUTTON_ID = "delete-all-runs-btn";
    const PROGRESS_ID = "delete-all-runs-progress";
    const MAX_PAGES = 50;
    const DELETE_INTERVAL_MS = 100;
    const RATE_LIMIT_WAIT_MS = 60_000;

    // --- Collect delete forms ---

    async function collectAllDeleteForms(ctx) {
      // Collect delete forms from current page DOM
      const allForms = extractDeleteForms(document);

      // Fetch subsequent pages
      const basePath = `/${ctx.owner}/${ctx.repo}/actions/workflows/${ctx.workflowFile}`;
      for (let page = 2; page <= MAX_PAGES; page++) {
        const url = `${basePath}?page=${page}`;
        const resp = await fetch(url);
        if (!resp.ok) break;

        const html = await resp.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const pageForms = extractDeleteForms(doc);
        if (pageForms.size === 0) break;

        for (const [runId, info] of pageForms) {
          allForms.set(runId, info);
        }
      }

      return allForms;
    }

    // --- Delete a single run ---

    async function deleteRun(formInfo) {
      const resp = await fetch(formInfo.action, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          _method: "delete",
          authenticity_token: formInfo.token,
        }),
        redirect: "manual",
      });
      return resp;
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // --- Progress UI ---

    function showProgress(current, total) {
      let container = document.getElementById(PROGRESS_ID);
      if (!container) {
        container = document.createElement("div");
        container.id = PROGRESS_ID;
        container.className = "delete-all-runs-progress";
        container.innerHTML = `
          <div class="delete-all-runs-progress-bar-container">
            <div class="delete-all-runs-progress-bar" style="width: 0%"></div>
          </div>
          <span class="delete-all-runs-progress-text"></span>
        `;
        const btn = document.getElementById(BUTTON_ID);
        if (btn) btn.parentNode.insertBefore(container, btn.nextSibling);
      }
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      container.querySelector(".delete-all-runs-progress-bar").style.width =
        `${pct}%`;
      container.querySelector(
        ".delete-all-runs-progress-text"
      ).textContent = `削除中... ${current} / ${total}`;
    }

    function removeProgress() {
      document.getElementById(PROGRESS_ID)?.remove();
    }

    // --- Main delete flow ---

    async function handleDelete(ctx) {
      const btn = document.getElementById(BUTTON_ID);
      btn.disabled = true;
      btn.textContent = "Run IDを収集中...";

      let deleteForms;
      try {
        deleteForms = await collectAllDeleteForms(ctx);
      } catch (e) {
        alert(`Run情報の収集に失敗しました: ${e.message}`);
        btn.disabled = false;
        btn.textContent = "Delete All Runs";
        return;
      }

      if (deleteForms.size === 0) {
        alert("削除対象のworkflow runがありません。");
        btn.disabled = false;
        btn.textContent = "Delete All Runs";
        return;
      }

      if (
        !confirm(
          `${deleteForms.size} 件のworkflow runを削除します。よろしいですか？`
        )
      ) {
        btn.disabled = false;
        btn.textContent = "Delete All Runs";
        return;
      }

      const total = deleteForms.size;
      btn.style.display = "none";
      showProgress(0, total);

      let deleted = 0;
      let errors = 0;

      for (const [runId, formInfo] of deleteForms) {
        try {
          const resp = await deleteRun(formInfo);

          if (resp.status === 404) {
            deleted++;
            showProgress(deleted, total);
            await sleep(DELETE_INTERVAL_MS);
            continue;
          }

          if (resp.status === 401 || resp.status === 403) {
            alert("認証エラーまたは権限がありません。ページをリロードしてください。");
            break;
          }

          if (resp.status === 429) {
            showProgress(deleted, total);
            document.querySelector(
              `#${PROGRESS_ID} .delete-all-runs-progress-text`
            ).textContent = `レート制限... 60秒待機中`;
            await sleep(RATE_LIMIT_WAIT_MS);
            const retryResp = await deleteRun(formInfo);
            if (!retryResp.ok && retryResp.status !== 404) {
              errors++;
            }
            deleted++;
            showProgress(deleted, total);
            await sleep(DELETE_INTERVAL_MS);
            continue;
          }

          if (resp.status >= 400) {
            errors++;
          }
        } catch (e) {
          errors++;
        }

        deleted++;
        showProgress(deleted, total);
        await sleep(DELETE_INTERVAL_MS);
      }

      removeProgress();

      if (errors > 0) {
        alert(
          `完了: ${deleted} 件中 ${errors} 件のエラーがありました。ページをリロードします。`
        );
      }

      location.reload();
    }

    // --- Button injection ---

    function injectButton() {
      if (document.getElementById(BUTTON_ID)) return;

      const ctx = parseWorkflowUrl();
      if (!ctx) return;

      // Find the "Filter workflow runs" search input and insert before it
      const searchInput =
        document.querySelector('input[placeholder="Filter workflow runs"]') ||
        document.querySelector('.subnav-search-input') ||
        document.querySelector('input[name="query"]');

      // The search input's parent form or wrapper
      const searchContainer = searchInput
        ? searchInput.closest("form") || searchInput.parentElement
        : null;

      if (!searchContainer) return;

      const btn = document.createElement("button");
      btn.id = BUTTON_ID;
      btn.type = "button";
      btn.className = "delete-all-runs-btn";
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path fill-rule="evenodd" d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"/>
        </svg>
        Delete All Runs
      `;
      btn.addEventListener("click", () => handleDelete(ctx));

      // Wrap button + search form in a flex container for horizontal layout
      const wrapper = document.createElement("div");
      wrapper.className = "delete-all-runs-wrapper";
      searchContainer.parentNode.insertBefore(wrapper, searchContainer);
      wrapper.appendChild(btn);
      wrapper.appendChild(searchContainer);
    }

    // --- SPA navigation support ---

    function init() {
      injectButton();
    }

    // Initial injection
    init();

    // Re-inject on Turbo (GitHub SPA) navigation
    document.addEventListener("turbo:load", () => {
      init();
    });

    // Fallback: MutationObserver for dynamic content changes
    const observer = new MutationObserver(() => {
      if (!document.getElementById(BUTTON_ID) && parseWorkflowUrl()) {
        injectButton();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  })();
}

// --- Module exports for testing ---

if (typeof module !== "undefined") {
  module.exports = { parseWorkflowUrl, extractDeleteForms };
}
