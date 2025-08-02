const cheerio = require('cheerio');
const request = require('./request');
const axios = require("axios");
const fs = require('fs');
const {bookUid, saveMode, concurrentThreads} = require("./config")
const path = require('path');
const { Worker } = require('worker_threads');
const os = require('os');

// 清理文件名，移除不合法字符
const sanitizeFileName = (fileName) => {
  return fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
};

// 并发处理章节
const processChaptersConcurrently = async (chapters, saveMode) => {
  const maxWorkers = Math.min(concurrentThreads || 3, os.cpus().length, chapters.length);
  const results = [];
  const errors = [];
  
  // 创建任务队列
  const taskQueue = [...chapters];
  const workers = [];
  const activeWorkers = new Set();
  
  return new Promise((resolve, reject) => {
    let completedTasks = 0;
    
    const createWorker = () => {
      if (taskQueue.length === 0) return null;
      
      const chapter = taskQueue.shift();
      let volumeDir = null;
      if (saveMode === 2) {
        const sanitizedBookTitle = sanitizeFileName(chapter.bookTitle);
        const sanitizedVolumeTitle = sanitizeFileName(chapter.volume);
        volumeDir = path.join('.', sanitizedBookTitle, sanitizedVolumeTitle);
      }
      
      const worker = new Worker('./worker.js', {
        workerData: {
          chapter,
          saveMode,
          volumeDir
        }
      });
      
      activeWorkers.add(worker);
      
      worker.on('message', (result) => {
        completedTasks++;
        
        if (result.success) {
          if (saveMode === 1) {
            results.push({ chapter: result.chapter, detail: result.detail });
          }
          console.log(result.message || `Processed chapter: ${result.chapter.title}`);
        } else {
          errors.push({ chapter: result.chapter, error: result.error });
          console.error(`Error processing chapter ${result.chapter.title}:`, result.error);
        }
        
        // 清理worker
        activeWorkers.delete(worker);
        worker.terminate();
        
        // 检查是否还有任务
        if (taskQueue.length > 0) {
          const newWorker = createWorker();
          if (newWorker) workers.push(newWorker);
        }
        
        // 检查是否所有任务完成
        if (completedTasks === chapters.length) {
          resolve({ results, errors });
        }
      });
      
      worker.on('error', (error) => {
        completedTasks++;
        errors.push({ chapter, error: error.message });
        console.error(`Worker error for chapter ${chapter.title}:`, error);
        
        activeWorkers.delete(worker);
        
        if (taskQueue.length > 0) {
          const newWorker = createWorker();
          if (newWorker) workers.push(newWorker);
        }
        
        if (completedTasks === chapters.length) {
          resolve({ results, errors });
        }
      });
      
      return worker;
    };
    
    // 启动初始workers
    for (let i = 0; i < maxWorkers; i++) {
      const worker = createWorker();
      if (worker) workers.push(worker);
    }
    
    // 如果没有章节需要处理
    if (chapters.length === 0) {
      resolve({ results: [], errors: [] });
    }
  });
};
const getChapters = async (bookPageUrl) => {
  try {
    const { data } = await request.get(bookPageUrl);
    const $ = cheerio.load(data);
    const chapters = [];
    
    // 获取书名
    const bookTitle = $('.story-title').text().trim() || '未知书名';
    
    // 获取卷信息和章节信息 - 适配新的网站结构
    $('.story-catalog').each((volumeIndex, volumeElement) => {
      const volumeTitle = $(volumeElement).find('.catalog-title').text().trim() || `卷${volumeIndex + 1}`;
      
      $(volumeElement).find('.catalog-list .clearfix > li > a').each((index, element) => {
        const href = $(element).attr('href');
        const chapterTitle = $(element).text().trim();
        if (href && !href.startsWith('/vip')) {
          chapters.push({
            url: href,
            title: chapterTitle,
            volume: volumeTitle,
            bookTitle: bookTitle
          });
        }
      });
    });
    
    // 如果没有找到卷结构，使用备用逻辑
    if (chapters.length === 0) {
      $('.clearfix > li > a').each((index, element) => {
        const href = $(element).attr('href');
        const chapterTitle = $(element).text().trim();
        if (href && !href.startsWith('/vip')) {
          chapters.push({
            url: href,
            title: chapterTitle,
            volume: '默认卷',
            bookTitle: bookTitle
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



const getStore = async () => {
  try {
    // 获取章节信息数组
    const chapters = await getChapters(`/Novel/${bookUid}/MainIndex/`);
    if (chapters.length === 0) {
      console.error("No chapters found or failed to retrieve chapters.");
      return;
    }

    console.log(`开始处理 ${chapters.length} 个章节，使用 ${Math.min(concurrentThreads || 3, os.cpus().length, chapters.length)} 个并发线程`);
    
    const startTime = Date.now();
    const { results, errors } = await processChaptersConcurrently(chapters, saveMode);
    const endTime = Date.now();
    
    console.log(`处理完成，耗时: ${(endTime - startTime) / 1000}秒`);
    console.log(`成功: ${chapters.length - errors.length}, 失败: ${errors.length}`);
    
    if (saveMode === 1) {
      // 原有保存方式：单个md文件，按正确的层级结构组织
      // 按章节顺序排序结果
      const sortedResults = results.sort((a, b) => {
        const aIndex = chapters.findIndex(ch => ch.url === a.chapter.url);
        const bIndex = chapters.findIndex(ch => ch.url === b.chapter.url);
        return aIndex - bIndex;
      });
      
      // 构建正确的Markdown层级结构
      let outputContent = '';
      let currentBookTitle = '';
      let currentVolume = '';
      
      for (const result of sortedResults) {
        const { detail, chapter } = result;
        
        // 添加书名（一级标题）
        if (currentBookTitle !== chapter.bookTitle) {
          currentBookTitle = chapter.bookTitle;
          outputContent += `# ${currentBookTitle}\n\n`;
        }
        
        // 添加卷名（二级标题）
        if (currentVolume !== chapter.volume) {
          currentVolume = chapter.volume;
          outputContent += `## ${currentVolume}\n\n`;
        }
        
        // 添加章节（三级标题）和内容
        outputContent += `### ${detail.title}\n\n${detail.author} | ${detail.updateTime} | ${detail.wordCount}\n\n${detail.content}\n`;
      }
      
      try {
        fs.writeFileSync('output.md', outputContent, 'utf8');
        console.log('文件保存成功：output.md');
      } catch (error) {
        console.error('Error writing to file:', error);
      }
    } else if (saveMode === 2) {
      // 新保存方式：按书名/卷名创建文件夹，章节名为md名称
      console.log('所有章节保存完成，按书名/卷名分文件夹保存');
    }
    
    // 输出错误信息
    if (errors.length > 0) {
      console.log('\n处理失败的章节:');
      errors.forEach(error => {
        console.log(`- ${error.chapter.title}: ${error.error}`);
      });
    }
  } catch (error) {
    console.error('Error in getStore:', error);
  }
};

getStore();
