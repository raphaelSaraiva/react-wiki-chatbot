const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const APP_URL = process.env.APP_URL || "http://localhost:3001";
const API_URL = process.env.API_URL || "http://127.0.0.1:3333";
const chromePath =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const outDir = path.resolve(__dirname, "..", "video-output");
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const questions = [
  "How can the latency metric be used to evaluate the performance of a blockchain?",
  "What is the difference between throughput and transactions per second in a blockchain network?",
  "How can transaction confirmation time be used as a latency metric in a blockchain network?",
];

async function prefetchOpenAiAnswers() {
  const answers = {};
  for (const question of questions) {
    console.log(`[record] prefetching OpenAI answer: ${question}`);
    const response = await fetch(`${API_URL}/ask-question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        model: "openai",
        mode: "both",
        metricId: "t12",
        metricName: "Latency",
        history: [],
        answerLanguage: "en",
      }),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI prefetch failed (${response.status}): ${body.slice(0, 300)}`);
    }
    if (/The system could not process|Could not get an answer from the LLM|Não foi possível obter/i.test(body)) {
      throw new Error(`OpenAI prefetch returned fallback text: ${body.slice(0, 300)}`);
    }
    answers[question] = JSON.parse(body);
  }
  return answers;
}

async function clickIfVisible(page, selector, options = {}) {
  const loc = page.locator(selector).first();
  if ((await loc.count()) && (await loc.isVisible())) {
    await loc.click(options);
    return true;
  }
  return false;
}

async function collapseHistory(page) {
  const historyPanel = page.locator("text=/History|Histórico/").first();
  if (!(await historyPanel.count())) return;

  const minimizeButton = page.locator('button[title="Minimizar"], button[title="Minimize"]').first();
  if ((await minimizeButton.count()) && (await minimizeButton.isVisible())) {
    await minimizeButton.click();
    await sleep(500);
  }
}

async function showPresentationOverlay(page, { title, subtitle, duration = 4500 }) {
  await page.evaluate(({ title, subtitle }) => {
    const old = document.getElementById("demo-presentation-overlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "demo-presentation-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "999999";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.textAlign = "center";
    overlay.style.color = "#fff";
    overlay.style.background =
      "linear-gradient(135deg, #08104f 0%, #1d43b7 48%, #f7b500 100%)";
    overlay.style.fontFamily =
      "Inter, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    overlay.innerHTML = `
      <div style="max-width: 900px; padding: 48px;">
        <div style="font-size: 18px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.86; margin-bottom: 18px;">
          Blockchain Metrics Wiki
        </div>
        <div style="font-size: 56px; line-height: 1.04; font-weight: 900; margin-bottom: 22px;">
          ${title}
        </div>
        <div style="font-size: 25px; line-height: 1.38; font-weight: 500; opacity: 0.94;">
          ${subtitle}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }, { title, subtitle });

  await sleep(duration);
  await page.evaluate(() => {
    const overlay = document.getElementById("demo-presentation-overlay");
    if (overlay) overlay.remove();
  });
}

async function showStandalonePresentation(page, { title, subtitle, duration = 4500 }) {
  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            font-family: Inter, Segoe UI, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          }
          body {
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            text-align: center;
            background: linear-gradient(135deg, #08104f 0%, #1d43b7 48%, #f7b500 100%);
          }
          .wrap {
            max-width: 900px;
            padding: 48px;
          }
          .brand {
            font-size: 18px;
            font-weight: 800;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            opacity: 0.86;
            margin-bottom: 18px;
          }
          h1 {
            font-size: 56px;
            line-height: 1.04;
            font-weight: 900;
            margin: 0 0 22px;
          }
          p {
            font-size: 25px;
            line-height: 1.38;
            font-weight: 500;
            opacity: 0.94;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <main class="wrap">
          <div class="brand">Blockchain Metrics Wiki</div>
          <h1>${title}</h1>
          <p>${subtitle}</p>
        </main>
      </body>
    </html>
  `);
  await sleep(duration);
}

async function main() {
  const openAiAnswers = await prefetchOpenAiAnswers();

  const browser = await chromium.launch({
    headless: false,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: outDir,
      size: { width: 1440, height: 900 },
    },
  });

  const page = await context.newPage();
  await page.route("**/ask-question", async (route) => {
    const payload = JSON.parse(route.request().postData() || "{}");
    const cached = openAiAnswers[payload.question];
    if (!cached) {
      return route.fallback();
    }
    console.log("[record] fulfilling /ask-question with cached OpenAI answer:", payload.question);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...cached,
        model: "openai",
        metricId: payload.metricId || cached.metricId || "t12",
        metricName: payload.metricName || cached.metricName || "Latency",
        mode: "both",
      }),
    });
  });
  page.on("request", (request) => {
    if (request.url().includes("/ask-question")) {
      console.log("[record] /ask-question payload:", request.postData() || "");
    }
  });
  page.on("response", async (response) => {
    if (response.url().includes("/ask-question")) {
      let preview = "";
      try {
        preview = (await response.text()).slice(0, 500).replace(/\s+/g, " ");
      } catch {
        preview = "<unavailable>";
      }
      console.log(`[record] /ask-question status=${response.status()} body=${preview}`);
    }
  });
  page.on("dialog", async (dialog) => {
    console.log(`Dialog: ${dialog.message()}`);
    await sleep(900);
    await dialog.accept();
  });

  await showStandalonePresentation(page, {
    title: "Experiment Demonstration",
    subtitle:
      "This demo presents the metric catalog, search task, RAG chatbot, answer comparison, and final feedback flow.",
    duration: 5200,
  });

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("userUid");
    localStorage.removeItem("userDisplayName");
    localStorage.removeItem("userPhotoURL");
    localStorage.setItem("wikiMetricsLanguage", "en");
  });
  await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });
  await sleep(5200);

  await page.evaluate(() => {
    localStorage.setItem("userUid", "video-demo-user");
    localStorage.setItem("userDisplayName", "Participant Demo");
    localStorage.setItem(
      "userPhotoURL",
      "https://www.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png"
    );
    localStorage.setItem("wikiMetricsLanguage", "en");
    localStorage.removeItem("tutorialCompleted");
    localStorage.setItem(
      "chatboxWindow_v2",
      JSON.stringify({ x: 360, y: 92, pinned: false, manual: true })
    );
    localStorage.setItem(
      "historyFloatingWindow_v4",
      JSON.stringify({
        box: { x: 880, y: 84, w: 500, h: 420 },
        open: true,
        min: true,
        docked: false,
        closedBtn: { x: 880, y: 84, docked: false },
        openItems: {},
        metricId: "t12",
      })
    );
    Object.keys(localStorage)
      .filter((key) => key.startsWith("experimentState_v1__uid_video-demo-user"))
      .forEach((key) => localStorage.removeItem(key));
  });

  await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });
  await sleep(2000);

  // Tutorial: advance through the carousel and finish.
  for (let i = 0; i < 4; i += 1) {
    await sleep(1400);
    if (i < 3) await page.keyboard.press("ArrowRight");
  }
  await clickIfVisible(page, "text=Start using");
  await sleep(1800);

  // Visit required metrics.
  for (const metricId of ["t1", "t2", "t3"]) {
    await page.goto(`${APP_URL}/metric/${metricId}`, { waitUntil: "domcontentloaded" });
    await sleep(2600);
  }

  // Use metric search and click a result.
  await page.locator(".sidebar-search input").fill("lat");
  await sleep(1200);
  await page.locator(".sidebar-item").first().click();
  await sleep(2500);
  await page.evaluate(() => {
    const key = "experimentState_v1__uid_video-demo-user";
    const now = new Date().toISOString();
    const current = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(
      key,
      JSON.stringify({
        ...current,
        metricsVisited: { ...(current.metricsVisited || {}), t1: true, t2: true, t3: true },
        chatEntries: Array.isArray(current.chatEntries) ? current.chatEntries : [],
        finalFeedback: current.finalFeedback || { sent: false, sentAt: null },
        meta: {
          ...(current.meta || {}),
          version: 3,
          updatedAt: now,
          chatCompletedCount: Number(current?.meta?.chatCompletedCount || 0),
          metricSearchUsedCount: Math.max(Number(current?.meta?.metricSearchUsedCount || 0), 1),
          metricSearchClickCount: Math.max(Number(current?.meta?.metricSearchClickCount || 0), 1),
          metricSearchTaskDone: true,
          lastMetricSearchTerm: "lat",
          lastMetricSearchClickedMetricId: "t12",
        },
      })
    );
    window.dispatchEvent(new Event("experimentStateChanged"));
  });
  await sleep(800);

  // Open chatbot after unlocking.
  await page.getByRole("button", { name: /Chatbot/i }).click();
  await sleep(1600);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0 }));
  await sleep(500);
  await collapseHistory(page);
  const modelSelect = page.locator('select').filter({ has: page.locator('option[value="openai"]') }).first();
  if (await modelSelect.count()) {
    await modelSelect.selectOption("openai");
    await sleep(500);
  }
  const selectedModel = await modelSelect.inputValue();
  if (selectedModel !== "openai") {
    throw new Error(`Expected model=openai before recording questions, got "${selectedModel}"`);
  }
  await page.locator("textarea").first().scrollIntoViewIfNeeded();
  await sleep(500);

  async function askAndSave(question, ratingIndex = 3) {
    await page.locator("textarea").first().fill(question);
    await sleep(900);
    const answerResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/ask-question"),
      { timeout: 180000 }
    );
    await page.getByRole("button", { name: /Enviar|Send/i }).click();
    const answerResponse = await answerResponsePromise;
    const answerBody = await answerResponse.text();
    if (!answerResponse.ok()) {
      throw new Error(`/ask-question returned ${answerResponse.status()}: ${answerBody.slice(0, 250)}`);
    }
    if (
      /The system could not process|Could not get an answer from the LLM|NÃ£o foi possÃ­vel obter/i.test(
        answerBody
      )
    ) {
      throw new Error(`/ask-question returned a fallback answer: ${answerBody.slice(0, 250)}`);
    }
    await page.getByRole("button", { name: /^Send$/i }).waitFor({ timeout: 30000 });
    const fallbackAnswer = page
      .locator("text=/The system could not process|Could not get an answer from the LLM|NÃ£o foi possÃ­vel obter/")
      .first();
    if ((await fallbackAnswer.count()) && (await fallbackAnswer.isVisible())) {
      throw new Error("The chatbot displayed a fallback/error answer instead of an OpenAI response.");
    }

    await page.locator("text=/Opção 1|Option 1/").first().waitFor({ timeout: 120000 });
    await page.locator("text=/Opção 2|Option 2/").first().waitFor({ timeout: 120000 });
    await sleep(2600);

    await page.locator("text=/Opção 1|Option 1/").first().scrollIntoViewIfNeeded();
    await sleep(900);

    const preferred = page.locator('input[name="preferred"]');
    await preferred.nth(0).check();
    await sleep(700);

    // Show the first answer rating, then scroll down so the second answer/rating is visible.
    await page.locator("button", { hasText: String(ratingIndex + 1) }).nth(0).scrollIntoViewIfNeeded();
    await page.locator("button", { hasText: String(ratingIndex + 1) }).nth(0).click();
    await sleep(700);

    await page.locator("text=/Opção 2|Option 2/").first().scrollIntoViewIfNeeded();
    await sleep(900);
    await page.locator("button", { hasText: String(ratingIndex + 1) }).nth(1).click();
    await sleep(1200);

    await page.getByRole("button", { name: /Salvar preferida|Save preferred/i }).scrollIntoViewIfNeeded();
    await sleep(600);
    await page.getByRole("button", { name: /Salvar preferida|Save preferred/i }).click();
    await sleep(2600);

    await collapseHistory(page);
    await page.locator("textarea").first().scrollIntoViewIfNeeded();
    await sleep(900);
  }

  for (const [index, q] of questions.entries()) {
    try {
      await askAndSave(q, index === 1 ? 4 : 3);
    } catch (error) {
      console.warn(`Nao foi possivel concluir a pergunta ${index + 1}:`, error.message);
      await sleep(5000);
    }
  }

  await sleep(2500);

  // Open and fill final feedback.
  await page.getByRole("button", { name: /^Feedback$/i }).click();
  await page.locator(".modal-dialog").waitFor({ timeout: 30000 });
  await sleep(1600);

  await page.locator("#consent-pdf").check();
  await sleep(800);
  await page.getByRole("button", { name: /Continuar|Continue/i }).click();
  await sleep(1200);

  // Pre-questionnaire.
  await page.locator('.modal input.form-control').nth(0).fill("34");
  await page.locator('input[name="pre-DQ1_gender"]').nth(1).check();
  await page.locator('input[name="pre-DQ2_education"]').nth(2).check();
  await page.locator('.modal input.form-control').nth(1).fill("Software Engineering Researcher");
  await page.locator('input[name="pre-DQ4_expertise"]').nth(2).check();
  await page.locator('.modal input.form-control').nth(2).fill("8");
  await page.locator('.modal input.form-control').nth(3).fill("4");
  await page.locator('input[name="pre-DQ7_familiarity"]').nth(1).check();
  await sleep(1800);
  await page.getByRole("button", { name: /Continuar|Continue/i }).click();
  await sleep(1300);

  // TAM intro.
  await page.getByRole("button", { name: /Iniciar|Start/i }).click();
  await sleep(1200);

  // Four TAM sections, four items each. Use varied, plausible responses instead of
  // selecting the same Likert option throughout the demo.
  const tamChoices = [
    3, 4, 3, 2,
    4, 3, 4, 3,
    3, 2, 4, 3,
    4, 3, 2, 4,
  ];
  for (let section = 0; section < 4; section += 1) {
    for (let item = section * 4 + 1; item <= section * 4 + 4; item += 1) {
      await page.locator(`input[name="tam-${item}"]`).nth(tamChoices[item - 1]).check();
      await sleep(120);
    }
    await sleep(1000);
    await page.getByRole("button", { name: /Próximo|Proximo|Next/i }).click();
    await sleep(1200);
  }

  // Open feedback text.
  const finalTexts = [
    "The organization by metrics and the answer comparison flow help explore the content in a structured way.",
    "Some answers may require careful reading, especially when the selected metric contains many technical details.",
    "Adding practical examples and advanced filters could make the metrics easier to apply in future studies.",
    "The experience clearly demonstrates the full experiment flow, from metric exploration to final evaluation.",
  ];
  for (const [index, text] of finalTexts.entries()) {
    await page.locator(".modal textarea").nth(index).fill(text);
  }
  await sleep(2200);

  await showPresentationOverlay(page, {
    title: "Thank You",
    subtitle:
      "The demonstration is complete. Thank you for watching the Blockchain Metrics Wiki experiment flow.",
    duration: 5200,
  });

  await context.close();
  await browser.close();

  const videos = fs
    .readdirSync(outDir)
    .filter((name) => name.endsWith(".webm"))
    .map((name) => path.join(outDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  console.log(`Video criado: ${videos[0] || outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
