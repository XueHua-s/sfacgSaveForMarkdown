const cheerio = require('cheerio');
const request = require('./request');
const axios = require("axios");
const fs = require('fs');
const {bookUid, saveMode} = require("./config")
const path = require('path');

// 清理文件名，移除不合法字符
const sanitizeFileName = (fileName) => {
  return fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
};
const getChapters = async (bookPageUrl) => {
  try {
    const { data } = await request.get(bookPageUrl);
    const $ = cheerio.load(data);
    const chapters = [];
    
    // 获取卷信息和章节信息
    $('.volume-list').each((volumeIndex, volumeElement) => {
      const volumeTitle = $(volumeElement).find('.volume-title').text().trim() || `卷${volumeIndex + 1}`;
      
      $(volumeElement).find('.clearfix > li > a').each((index, element) => {
        const href = $(element).attr('href');
        const chapterTitle = $(element).text().trim();
        if (href && !href.startsWith('/vip')) {
          chapters.push({
            url: href,
            title: chapterTitle,
            volume: volumeTitle
          });
        }
      });
    });
    
    // 如果没有找到卷结构，使用原有逻辑
    if (chapters.length === 0) {
      $('.clearfix > li > a').each((index, element) => {
        const href = $(element).attr('href');
        const chapterTitle = $(element).text().trim();
        if (href && !href.startsWith('/vip')) {
          chapters.push({
            url: href,
            title: chapterTitle,
            volume: '默认卷'
          });
        }
      });
    }
    
    return chapters;
  } catch (error) {
    console.error(`Error fetching chapters from ${bookPageUrl}:`, error);
    // 返回空数组，保证后续代码能够正常处理
    return [];
  }
};

const getCapterDetail = async (url) => {
  try {
    const { data } = await request.get(url);
    const $ = cheerio.load(data);

    // 提取章节相关信息
    const title = $('.article-hd .article-title').text().trim();
    const author = $('.article-hd .article-desc .text').eq(0).text().trim();
    const updateTime = $('.article-hd .article-desc .text').eq(1).text().trim();
    const wordCount = $('.article-hd .article-desc .text').eq(2).text().trim();

    // 生成 markdown 标题和描述信息
    const headerMarkdown = `# ${title}\n\n${author} | ${updateTime} | ${wordCount}\n\n`;

    // 提取文章内容段落
    let contentMarkdown = '';
    $('.article-content p').each((i, el) => {
      const paragraph = $(el).text().trim();
      if (paragraph) {
        contentMarkdown += paragraph + '\n\n';
      }
    });

    return headerMarkdown + contentMarkdown;
  } catch (error) {
    console.error(`Error fetching chapter detail from ${url}:`, error);
    // 返回错误提示内容，保证输出文件中有提示
    return `# Error fetching chapter detail for ${url}\n\nAn error occurred while retrieving the content.\n\n`;
  }
};

const getStore = async () => {
  try {
    // 获取章节信息数组
    const chapters = await getChapters(`/Novel/${bookUid}/MainIndex/`);
    if (chapters.length === 0) {
      console.error("No chapters found or failed to retrieve chapters.");
      return;
    }

    if (saveMode === 1) {
      // 原有保存方式：单个md文件
      const details = [];
      for (const chapter of chapters) {
        try {
          const detail = await getCapterDetail(chapter.url);
          console.log(`Processed chapter ${chapter.url}`);
          details.push(detail);
        } catch (error) {
          console.error(`Error processing chapter ${chapter.url}:`, error);
        }
      }
      
      const outputContent = details.join('\n');
      try {
        fs.writeFileSync('output.md', outputContent, 'utf8');
        console.log('文件保存成功：output.md');
      } catch (error) {
        console.error('Error writing to file:', error);
      }
    } else if (saveMode === 2) {
      // 新保存方式：按卷名创建文件夹，章节名为md名称
      const volumeMap = new Map();
      
      // 按卷分组章节
      chapters.forEach(chapter => {
        if (!volumeMap.has(chapter.volume)) {
          volumeMap.set(chapter.volume, []);
        }
        volumeMap.get(chapter.volume).push(chapter);
      });
      
      // 为每个卷创建文件夹并保存章节
      for (const [volumeName, volumeChapters] of volumeMap) {
        const sanitizedVolumeName = sanitizeFileName(volumeName);
        const volumeDir = path.join('.', sanitizedVolumeName);
        
        // 创建卷文件夹
        if (!fs.existsSync(volumeDir)) {
          fs.mkdirSync(volumeDir, { recursive: true });
        }
        
        // 处理该卷的每个章节
        for (const chapter of volumeChapters) {
          try {
            const detail = await getCapterDetail(chapter.url);
            const sanitizedChapterName = sanitizeFileName(chapter.title);
            const chapterFilePath = path.join(volumeDir, `${sanitizedChapterName}.md`);
            
            fs.writeFileSync(chapterFilePath, detail, 'utf8');
            console.log(`Processed chapter: ${chapterFilePath}`);
          } catch (error) {
            console.error(`Error processing chapter ${chapter.url}:`, error);
          }
        }
      }
      
      console.log('所有章节保存完成，按卷名分文件夹保存');
    }
  } catch (error) {
    console.error('Error in getStore:', error);
  }
};

getStore();
