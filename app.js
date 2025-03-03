const cheerio = require('cheerio');
const request = require('./request');
const axios = require("axios");
const fs = require('fs');

const getChapters = async (bookPageUrl) => {
  try {
    const { data } = await request.get(bookPageUrl);
    const $ = cheerio.load(data);
    const links = [];
    $('.clearfix > li > a').each((index, element) => {
      const href = $(element).attr('href');
      if (href && !href.startsWith('/vip')) {
        links.push(href);
      }
    });
    return links;
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
    // 获取章节 URL 数组
    const capterUrls = await getChapters("/Novel/41103/MainIndex/");
    if (capterUrls.length === 0) {
      console.error("No chapters found or failed to retrieve chapters.");
      return;
    }

    const details = [];
    // 依次请求每个章节详情，单独捕获每个章节的错误
    for (const url of capterUrls) {
      try {
        const detail = await getCapterDetail(url);
        console.log(detail);
        details.push(detail);
      } catch (error) {
        console.error(`Error processing chapter ${url}:`, error);
      }
    }

    // 拼接所有章节详情，并写入文件
    const outputContent = details.join('\n');
    try {
      fs.writeFileSync('output.md', outputContent, 'utf8');
      console.log('文件保存成功：output.md');
    } catch (error) {
      console.error('Error writing to file:', error);
    }
  } catch (error) {
    console.error('Error in getStore:', error);
  }
};

getStore();
