const { parentPort, workerData } = require('worker_threads');
const cheerio = require('cheerio');
const request = require('./request');
const fs = require('fs');
const path = require('path');

// 清理文件名，移除不合法字符
const sanitizeFileName = (fileName) => {
  return fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
};

// 获取章节详情
const getCapterDetail = async (url) => {
  try {
    const { data } = await request.get(url);
    const $ = cheerio.load(data);

    // 提取章节相关信息
    const title = $('.article-hd .article-title').text().trim();
    const author = $('.article-hd .article-desc .text').eq(0).text().trim();
    const updateTime = $('.article-hd .article-desc .text').eq(1).text().trim();
    const wordCount = $('.article-hd .article-desc .text').eq(2).text().trim();

    // 提取文章内容段落
    let contentMarkdown = '';
    $('.article-content p').each((i, el) => {
      const paragraph = $(el).text().trim();
      if (paragraph) {
        contentMarkdown += paragraph + '\n\n';
      }
    });

    return {
      title,
      author,
      updateTime,
      wordCount,
      content: contentMarkdown
    };
  } catch (error) {
    console.error(`Error fetching chapter detail from ${url}:`, error);
    return {
      title: `Error fetching chapter detail for ${url}`,
      author: '',
      updateTime: '',
      wordCount: '',
      content: 'An error occurred while retrieving the content.\n\n'
    };
  }
};

// 处理单个章节
const processChapter = async () => {
  const { chapter, saveMode, volumeDir } = workerData;
  
  try {
    const detail = await getCapterDetail(chapter.url);
    
    if (saveMode === 2) {
      // 按书名/卷名创建文件夹，章节名为md名称
      const sanitizedChapterName = sanitizeFileName(chapter.title);
      const chapterFilePath = path.join(volumeDir, `${sanitizedChapterName}.md`);
      
      // 确保目录存在（递归创建书名/卷名文件夹）
      if (!fs.existsSync(volumeDir)) {
        fs.mkdirSync(volumeDir, { recursive: true });
      }
      
      // 为saveMode 2生成单独的章节文件内容
      const chapterContent = `# ${detail.title}\n\n${detail.author} | ${detail.updateTime} | ${detail.wordCount}\n\n${detail.content}`;
      fs.writeFileSync(chapterFilePath, chapterContent, 'utf8');
      
      parentPort.postMessage({
        success: true,
        message: `Processed chapter: ${chapterFilePath}`,
        chapter: chapter
      });
    } else {
      // 返回章节详细信息，由主线程合并为正确的层级结构
      parentPort.postMessage({
        success: true,
        detail: detail,
        chapter: chapter
      });
    }
  } catch (error) {
    parentPort.postMessage({
      success: false,
      error: error.message,
      chapter: chapter
    });
  }
};

// 开始处理
processChapter();