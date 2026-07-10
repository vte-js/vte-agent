# VTE Agent

VS Code AI 编程助手，带狐狸头像、上下文感知和细粒度权限控制。

## 功能特性

- **多模型支持** — 支持 GPT-4o、Claude、DeepSeek、Qwen 等多种模型切换
- **上下文附加** — 支持文件、文件夹、文档、Skills、终端输出、Git 变更作为上下文
- **内置 Skills** — 9 套编码技能：代码审查、单元测试、重构、调试、API 设计、安全审计、数据库设计、性能优化、Git 工作流
- **权限控制** — 细粒度工具权限（允许/询问/拒绝），实时授权弹窗
- **推理强度** — 低（快速）、中（均衡）、高（深度思考），差异化行为
- **快捷指令** — 输入 `/` 快速访问 Skills，`@` 附加上下文
- **会话管理** — 创建、恢复、重命名、搜索会话
- **图片上传** — 附加图片作为视觉上下文
- **思考过程展示** — 可折叠的思考过程，带 Token 统计

## 安装

1. 打开 VS Code
2. 进入扩展市场（Ctrl+Shift+X）
3. 搜索 "VTE Agent"
4. 点击安装

或从 VSIX 安装：
```bash
code --install-extension vte-agent-0.0.1.vsix
```

## 快速开始

1. 从活动栏打开 VTE Agent 侧边栏
2. 点击设置按钮（⚙️）或运行 `VTE Agent: Open Chat`
3. 配置 API Key 和模型
4. 开始对话！

## 使用方法

### 快捷键
- `/` — 打开快捷指令面板（快速访问 Skills）
- `@` — 打开上下文附加菜单
- `Enter` — 发送消息
- `Shift+Enter` — 换行

### 上下文类型
- **文件** — 选择项目中的代码文件
- **文件夹** — 递归读取目录结构
- **文档** — Markdown、TXT 等文档文件
- **Skills** — Agent 技能定义（内置 + 项目）
- **终端** — 通过 Shell Integration 捕获终端输出
- **Git** — 工作区变更或最近提交记录

### 推理强度
- **低** — 关闭思考，最快响应
- **中** — 标准思考，平衡速度与质量
- **高** — 深度思考，降低 temperature 以获得更聚焦的推理

### 权限控制
在设置中配置每个类别的权限：
- 文件读取 / 写入
- 终端执行
- Git 操作
- 代码诊断
- 网络请求
- 任务 / 快照

## 配置

打开设置（`Cmd+,`）搜索 "VTE Agent" 进行配置：
- API Key
- API Base URL
- 模型名称

或点击侧边栏标题栏的设置按钮（⚙️）。

## 内置 Skills

| Skill | 描述 |
|-------|------|
| code-review | 代码质量、Bug、安全、性能审查 |
| unit-test | 生成单元测试，覆盖边界情况 |
| refactor | 遵循 SOLID 原则的代码重构 |
| debug | 系统化调试和根因分析 |
| api-design | RESTful API 设计模式 |
| security-audit | OWASP Top 10 安全检查 |
| database-design | Schema 设计和查询优化 |
| performance | 性能分析和优化 |
| git-workflow | Git 最佳实践和提交规范 |

## 开发

```bash
# 安装依赖
npm install
cd webview && npm install

# 构建
npm run compile && cd webview && npx vite build

# 开发模式
npm run watch

# 运行扩展
在 VS Code 中按 F5
```

## 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE)。
