# SF轻小说爬虫工具

一个用于从SF轻小说网站（book.sfacg.com）爬取小说章节并保存为Markdown格式的Node.js工具。支持多线程并发处理，提供两种保存模式。

## 功能特性

- 🚀 多线程并发爬取，提高处理效率
- 📚 支持按卷结构组织章节
- 💾 两种保存模式：单文件合并 / 分文件夹保存
- 🔧 可配置并发线程数
- 📝 自动生成Markdown格式文件
- 🛡️ 文件名安全处理，避免非法字符

## 环境要求

- [Node.js 14.0 或更高版本](https://nodejs.org/zh-cn/download/) - 从官网下载并安装
- npm 或 yarn 包管理器（随Node.js一起安装）

## 安装步骤

### 1. 克隆或下载项目

```bash
git clone <项目地址>
cd sfacgSaveForMarkdown
```

### 2. 安装依赖

```bash
npm install
```

或使用 yarn：

```bash
yarn install
```

### 3. 安装开发依赖（可选）

如果需要使用开发模式（自动重启）：

```bash
npm install -g nodemon
```

## 配置说明

编辑 `config.js` 文件进行配置：

```javascript
module.exports = {
  baseUrl: 'https://book.sfacg.com',    // SF轻小说网站地址
  bookUid: "481326",                    // 要爬取的小说ID
  saveMode: 2,                          // 保存模式：1=单文件，2=分文件夹
  concurrentThreads: 3                  // 并发线程数
}
```

### 配置参数详解

- **bookUid**: 小说的唯一标识符，可从小说页面URL中获取
  - 例如：`https://book.sfacg.com/Novel/481326/MainIndex/` 中的 `481326`
- **saveMode**: 保存模式选择
  - `1`: 将所有章节合并到单个 `output.md` 文件中，按书名→卷名→章节的层级结构组织
  - `2`: 按 `书名/卷名/章节名.md` 的文件夹结构分别保存每个章节
- **concurrentThreads**: 并发处理的线程数，建议设置为 1-5，过高可能导致网站限制访问

## 使用方法

### 1. 获取小说ID

1. 访问 SF轻小说网站：https://book.sfacg.com
2. 找到要下载的小说
3. 进入小说主页，从URL中复制小说ID
4. 将ID填入 `config.js` 的 `bookUid` 字段

### 2. 运行程序

#### 普通模式

```bash
node app.js
```

#### 开发模式（自动重启）

```bash
npm run dev
```

### 3. 查看结果

程序运行完成后，根据配置的保存模式：

- **模式1**: 在项目根目录生成 `output.md` 文件
- **模式2**: 在项目根目录生成 `书名/卷名/` 文件夹结构，每个章节为独立的 `.md` 文件

## 输出格式

### 保存模式1（单文件）

```markdown
# 书名

## 卷名1

### 章节1标题

作者信息 | 更新时间 | 字数

章节内容...

### 章节2标题

作者信息 | 更新时间 | 字数

章节内容...

## 卷名2

### 章节3标题
...
```

### 保存模式2（分文件夹）


### 常见问题

1. **网络超时**
   - 检查网络连接
   - 降低并发线程数
   - 重新运行程序

2. **找不到章节**
   - 确认小说ID是否正确
   - 检查小说是否存在或已下架

3. **文件保存失败**
   - 检查磁盘空间
   - 确认程序有写入权限

### 错误日志

程序运行时会显示详细的处理信息：
- 成功处理的章节数量
- 失败的章节及错误原因
- 总耗时统计

## 技术栈

- **Node.js**: 运行环境
- **Cheerio**: HTML解析
- **Axios**: HTTP请求
- **Worker Threads**: 多线程处理
- **Puppeteer**: 浏览器自动化（备用）

## 许可证

ISC License

## 贡献

欢迎提交Issue和Pull Request来改进这个工具。

---

**免责声明**: 本工具仅供学习和个人使用，请遵守相关网站的使用条款和版权规定。