const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');
const { baseUrl, bookUid, saveMode, concurrentThreads } = require('./config');

const sanitizeFileName = (fileName) => {
  return fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
};

const getChromeExecutablePath = () => {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
};

const launchBrowser = async () => {
  const executablePath = getChromeExecutablePath();
  const launchOptions = {
    headless: 'new'
  };

  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  return puppeteer.launch(launchOptions);
};

const getChapters = async (page, bookPageUrl) => {
  const targetUrl = new URL(bookPageUrl, baseUrl).toString();

  await page.goto(targetUrl, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await page.waitForSelector('.story-title', {
    timeout: 15000
  });

  return page.evaluate(() => {
    const chapters = [];
    const bookTitle = document.querySelector('.story-title')?.textContent?.trim() || '未知书名';

    document.querySelectorAll('.story-catalog').forEach((volumeElement, volumeIndex) => {
      const volumeTitle = volumeElement.querySelector('.catalog-title')?.textContent?.trim() || `卷${volumeIndex + 1}`;

      volumeElement.querySelectorAll('.catalog-list .clearfix > li > a').forEach((anchor) => {
        const href = anchor.getAttribute('href');
        const chapterTitle = anchor.textContent.trim();

        if (href && !href.startsWith('/vip')) {
          chapters.push({
            url: anchor.href,
            title: chapterTitle,
            volume: volumeTitle,
            bookTitle
          });
        }
      });
    });

    if (chapters.length === 0) {
      document.querySelectorAll('.clearfix > li > a').forEach((anchor) => {
        const href = anchor.getAttribute('href');
        const chapterTitle = anchor.textContent.trim();

        if (href && !href.startsWith('/vip')) {
          chapters.push({
            url: anchor.href,
            title: chapterTitle,
            volume: '默认卷',
            bookTitle
          });
        }
      });
    }

    return chapters;
  });
};

const getChapterDetail = async (page, url) => {
  await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await page.waitForSelector('.article-hd .article-title, .article-content', {
    timeout: 15000
  });

  return page.evaluate(() => {
    const desc = [...document.querySelectorAll('.article-hd .article-desc .text')].map((element) => element.textContent.trim());
    const paragraphs = [...document.querySelectorAll('.article-content p')]
      .map((element) => element.textContent.trim())
      .filter(Boolean);

    return {
      title: document.querySelector('.article-hd .article-title')?.textContent?.trim() || '未知章节',
      author: desc[0] || '',
      updateTime: desc[1] || '',
      wordCount: desc[2] || '',
      content: `${paragraphs.join('\n\n')}\n\n`
    };
  });
};

const saveChapterToFile = (chapter, detail) => {
  const bookDir = sanitizeFileName(chapter.bookTitle);
  const volumeDir = sanitizeFileName(chapter.volume);
  const chapterName = sanitizeFileName(chapter.title);
  const targetDir = path.join('.', bookDir, volumeDir);
  const targetFile = path.join(targetDir, `${chapterName}.md`);
  const content = `# ${detail.title}\n\n${detail.author} | ${detail.updateTime} | ${detail.wordCount}\n\n${detail.content}`;

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetFile, content, 'utf8');

  return targetFile;
};

const processChaptersConcurrently = async (browser, chapters, currentSaveMode) => {
  const maxWorkers = Math.min(concurrentThreads || 3, os.cpus().length, chapters.length);
  const results = [];
  const errors = [];
  let currentIndex = 0;

  const worker = async () => {
    const page = await browser.newPage();

    try {
      while (currentIndex < chapters.length) {
        const chapterIndex = currentIndex++;
        const chapter = chapters[chapterIndex];

        try {
          const detail = await getChapterDetail(page, chapter.url);

          if (currentSaveMode === 2) {
            const filePath = saveChapterToFile(chapter, detail);
            console.log(`Processed chapter: ${filePath}`);
          } else {
            results.push({ index: chapterIndex, chapter, detail });
            console.log(`Processed chapter: ${chapter.title}`);
          }
        } catch (error) {
          errors.push({ chapter, error: error.message });
          console.error(`Error processing chapter ${chapter.title}: ${error.message}`);
        }
      }
    } finally {
      await page.close();
    }
  };

  await Promise.all(Array.from({ length: maxWorkers }, () => worker()));

  return { results, errors };
};

const writeMergedMarkdown = (results) => {
  const sortedResults = results.sort((a, b) => a.index - b.index);
  let outputContent = '';
  let currentBookTitle = '';
  let currentVolume = '';

  for (const result of sortedResults) {
    const { detail, chapter } = result;

    if (currentBookTitle !== chapter.bookTitle) {
      currentBookTitle = chapter.bookTitle;
      outputContent += `# ${currentBookTitle}\n\n`;
    }

    if (currentVolume !== chapter.volume) {
      currentVolume = chapter.volume;
      outputContent += `## ${currentVolume}\n\n`;
    }

    outputContent += `### ${detail.title}\n\n${detail.author} | ${detail.updateTime} | ${detail.wordCount}\n\n${detail.content}`;
  }

  fs.writeFileSync('output.md', outputContent, 'utf8');
  console.log('文件保存成功：output.md');
};

const getStore = async () => {
  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    const chapters = await getChapters(page, `/Novel/${bookUid}/MainIndex/`);
    await page.close();

    if (chapters.length === 0) {
      console.error('No chapters found or failed to retrieve chapters.');
      return;
    }

    const workerCount = Math.min(concurrentThreads || 3, os.cpus().length, chapters.length);
    console.log(`开始处理 ${chapters.length} 个章节，使用 ${workerCount} 个并发页面`);

    const startTime = Date.now();
    const { results, errors } = await processChaptersConcurrently(browser, chapters, saveMode);
    const endTime = Date.now();

    console.log(`处理完成，耗时: ${(endTime - startTime) / 1000}秒`);
    console.log(`成功: ${chapters.length - errors.length}, 失败: ${errors.length}`);

    if (saveMode === 1) {
      writeMergedMarkdown(results);
    } else if (saveMode === 2) {
      console.log('所有章节保存完成，按书名/卷名分文件夹保存');
    }

    if (errors.length > 0) {
      console.log('\n处理失败的章节:');
      errors.forEach((error) => {
        console.log(`- ${error.chapter.title}: ${error.error}`);
      });
    }
  } catch (error) {
    console.error('Error in getStore:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

getStore();
