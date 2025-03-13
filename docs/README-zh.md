# CleverFiller

[English](../README.md) | 中文

![Example](../assets/example.png)

## 概述

用于填表操作的油猴脚本, 使用AI模型来为表单字段找到最佳匹配数据。简单来说，它可以让你从繁琐的填表操作中解放出来。

## 功能

**自动填充**: 根据提供的上下文自动填写表单字段。

**易于使用**: 可以选择表单中需要的字段。

**RPA类似的功能**: 可以设置预加载或后加载操作以创建工作流程。

## 基本用法

> [!IMPORTANT]
> 此脚本需要一个 Deepseek API 密钥来启用 AI 模型的实现。

1. **Enlist** 按钮允许您扫描表单中的可填写字段。
2. **Load** 按钮允许您在填写表单之前或之后单击某些按钮。
3. 在 **Context** 部分，您需要提供足够的上下文供 AI 模型分析和匹配数据。

## 安装

1. 安装 Tampermonkey 扩展或 [Scriptcat](https://docs.scriptcat.org/) 以便在浏览器中运行此脚本。
2. 将 CleverFiller 脚本导入扩展，使用此 URL: `https://raw.githubusercontent.com/joolowweng/cleverfiller/main/dist/cleverfiller.user.js`
3. 在扩展中启用脚本。

## 许可证

代码和文档均采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) 许可证进行许可。

<div align="center">
    <img src="https://mirrors.creativecommons.org/presskit/buttons/88x31/png/by-nc.png" alt="CC BY-NC" width="88" height="31" style="border-width:0" />
</div>
