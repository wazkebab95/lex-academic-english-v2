import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../lexacademicenglish_multipage/teacher/index.html", import.meta.url), "utf8");

test("teacher dashboard has learner and submission views", () => {
  assert.ok(page.includes('data-view="learners"'));
  assert.ok(page.includes('data-view="submissions"'));
  assert.ok(page.includes('id="learnerBody"'));
  assert.ok(page.includes('id="submissionBody"'));
});

test("teacher dashboard loads only through the protected teacher API", () => {
  assert.ok(page.includes("fetch('/api/teacher-data'"));
  assert.ok(page.includes("credentials:'same-origin'"));
  assert.ok(page.includes("cache:'no-store'"));
  assert.ok(page.includes('name="robots" content="noindex,nofollow"'));
});

test("untrusted learner content is rendered as text, not HTML", () => {
  assert.ok(page.includes("textContent"));
  assert.doesNotMatch(page, /\.innerHTML\s*=/);
  assert.doesNotMatch(page, /insertAdjacentHTML\s*\(/);
});

test("dashboard distinguishes expired and unauthorised teacher sessions", () => {
  assert.ok(page.includes("response.status===401"));
  assert.ok(page.includes("response.status===403"));
  assert.ok(page.includes("response.redirected"));
});

test("dashboard does not invent course completion or review states", () => {
  assert.doesNotMatch(page, /Needs review|Completed modules|Average progress/);
  assert.match(page, /summary derived from recorded learner activity/i);
});


test("failed refresh preserves the last successful sync state and records", () => {
  assert.ok(page.includes("dataset.lastSynced"));
  assert.ok(page.includes("last successfully loaded records remain visible"));
  assert.ok(page.includes("Refresh failed · showing last successful data"));
});


test("teacher dashboard schedules a 15-minute refresh and defers hidden tabs", () => {
  assert.ok(page.includes("const DASHBOARD_REFRESH_INTERVAL=15*60*1000;"));
  assert.ok(page.includes("function scheduleDashboardRefresh(delay=DASHBOARD_REFRESH_INTERVAL)"));
  assert.ok(page.includes("if(document.visibilityState==='visible')loadDashboard();"));
  assert.ok(page.includes("else scheduleDashboardRefresh(60*1000);"));
});

test("teacher dashboard refreshes on visibility and focus after the interval", () => {
  assert.ok(page.includes("document.addEventListener('visibilitychange'"));
  assert.ok(page.includes("window.addEventListener('focus'"));
  assert.ok(page.includes("Date.now()-lastDashboardAttempt>=DASHBOARD_REFRESH_INTERVAL"));
});

test("teacher dashboard prevents overlapping refreshes and backs off after failures", () => {
  assert.ok(page.includes("if(dashboardLoading)return;"));
  assert.ok(page.includes("dashboardRetryDelay=Math.min(dashboardRetryDelay*2,5*60*1000);"));
  assert.ok(page.includes("scheduleDashboardRefresh(loadedSuccessfully?DASHBOARD_REFRESH_INTERVAL:dashboardRetryDelay);"));
});
