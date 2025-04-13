![Example](assets/example.png)

## Overview

A tampermonkey script that fills form fields, using AI model to find the best match data for the fields. Simply, it just frees you a lot of time from filling out boring forms.

用于填表操作的油猴脚本, 使用AI模型来为表单字段找到最佳匹配数据。简单来说，它可以让你从繁琐的填表操作中解放出来。

## Features

**Auto-fill**: Automatically fills out form fields based on the context provided.

**Easy to use**: You have the discretion to choose which fields are needed in the form.

**RPA alike functionality**: You will be able to set up preload or afterload actions to create a workflow.

**自动填充**: 根据提供的上下文自动填写表单字段。

**易于使用**: 可以选择表单中需要的字段。

**RPA类似的功能**: 可以设置预加载或后加载操作以创建工作流程。

## Basic Usage

> [!IMPORTANT]
> You need a [Deepseek API](https://deepseek.ai/) key to enable implementation of AI model.
> 此脚本需要一个 Deepseek API 密钥来启用 AI 模型的实现。

1. **Enlist** button allows you to scan the fillable fields in the form.
2. **Load** button allows you to click certain buttons before or after filling the form.
3. In **Context** section, you will need to provide sufficient context for AI model to analyse and match the data.

## Installation

1. Install Tampermonkey extension or [Scriptcat](https://docs.scriptcat.org/) for your browser so as to run this script.
2. Import CleverFiller script to the extension with this url: `https://raw.githubusercontent.com/joolowweng/cleverfiller/main/dist/cleverfiller.user.js`
3. Enable the script in the extension.

## License

This work is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License.

<div align="center">
    <img src="https://mirrors.creativecommons.org/presskit/buttons/88x31/png/by-nc.png" alt="CC BY-NC" width="88" height="31" style="border-width:0" />
</div>
