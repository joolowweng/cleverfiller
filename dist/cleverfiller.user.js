// ==UserScript==
// @name         CleverFiller Beta
// @namespace    https://github.com/joolowweng/cleverfiller
// @version      1.2.3
// @description  A tampermonkey script that fills form fields, using deepseek to find the best match data for the field.
// @author       Joolowweng
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/joolowweng/cleverfiller/main/dist/cleverfiller.user.js
// @updateURL    https://raw.githubusercontent.com/joolowweng/cleverfiller/main/dist/cleverfiller.user.js
// @noframes     true
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_getResourceText
// @grant        GM_getResourceURL
// @grant        GM_info
// @resource     index https://raw.githubusercontent.com/joolowweng/cleverfiller/dev/html/index.html
// ==/UserScript==
'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// 2025-04-11 @ 10:02:49: Modify the logic that includes elements in the list rather than excluding them.
const InclusionList = GM_getValue('InclusionList', []);
function get_app_info() {
    const script = GM_info.script;
    const name = script.name;
    const version = script.version;
    return { name, version };
}
function get_response(options, on_start) {
    return __awaiter(this, void 0, void 0, function* () {
        // April 9 2025 - Added a callback function to be executed when the request starts.
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest(Object.assign(Object.assign({}, options), { onloadstart: function () {
                    if (on_start) {
                        on_start();
                    }
                }, onload: (response) => {
                    console.log('[CleverFiller] Response Status:', response.status);
                    if (response.status === 200) {
                        try {
                            resolve(JSON.parse(response.responseText)); // Resolve with the parsed response
                        }
                        catch (error) {
                            console.error('[CleverFiller] Failed to parse response:', error);
                            reject(new Error(`${error}`));
                        }
                    }
                    else {
                        console.error('[CleverFiller] HTTP Error:', response.status);
                        reject(new Error(`${response.status}`)); // Resolve with null in case of error
                    }
                }, onerror: (error) => {
                    console.error('[CleverFiller] Request failed:', error);
                    reject(new Error(`${error}`)); // Resolve with null in case of error
                } }));
        });
    });
}
function call_deepseek_api(prompt) {
    return __awaiter(this, void 0, void 0, function* () {
        // April 9 2025 - Refratored the code to improve readability and maintainability.
        const url = 'https://api.deepseek.com/v1/chat/completions';
        const method = 'POST';
        const model = GM_getValue('model', 'deepseek-chat');
        const data = {
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            stream: false,
        };
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + GM_getValue('api', ''),
        };
        try {
            return yield get_response({
                method: method,
                url: url,
                headers: headers,
                data: JSON.stringify(data),
            }); // Cast the response to the expected type
        }
        catch (error) {
            console.error('[CleverFiller] Error calling DeepSeek API:', error);
            throw error;
        }
    });
}
function create_prompt(context, formData) {
    // April 9 2025 - Added a new prompt format to improve the AI's understanding of the task.
    const prompt = `
        你是一个JSON数据处理机器人, 需要直接输出填充后的JSON, **不要任何解释**.

        **工作流程**:
        1. 解析文本信息
        2. 严格匹配JSON字段
        3. 仅修改value值
        4. 返回标准JSON格式

        **要求**:
        1. 仔细阅读用户提供的文本, 识别与每个JSON对象字段相关的信息
        2. 确保生成的JSON结构与原结构完全一致, 仅修改value字段.
        3. 保持JSON的原有顺序和结构, 不要添加或删除其他字段.
        4. 如果文本信息没有明确标明的值或多个值, 请根据上下文进行合理推测.
        5. 如果推断的值不确定, 请将value字段留空.

        -----------------------

        **文本信息**:
        ${context}

        **待填充JSON**:
        ${JSON.stringify(formData)}

    `;
    return prompt;
}
function parse_ai_response(response) {
    var _a, _b, _c;
    try {
        const msg_content = (_c = (_b = (_a = response === null || response === void 0 ? void 0 : response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
        if (!msg_content) {
            throw new Error('Invalid API response format');
        }
        const cleanStringData = msg_content.substring(msg_content.indexOf('['), msg_content.lastIndexOf(']') + 1);
        return JSON.parse(cleanStringData);
    }
    catch (error) {
        console.error('Failed to parse API response:', error);
        return [];
    }
}
// 2025.04.11: Fixed the issue where the script was not able to find the form elements correctly.
function scan_form_elements() {
    const allInputs = document.querySelectorAll('input, textarea, select');
    // Exclude elements within div[id="cleverfiller-container"]
    const filteredInputs = Array.from(allInputs).filter(input => {
        const parentDiv = input.closest('div#cleverfiller-container');
        return !parentDiv;
    });
    return filteredInputs;
}
function get_label_text(element) {
    var _a;
    // Get the label text of the element
    const parentDiv = element.closest('div');
    let labelText = parentDiv ? ((_a = parentDiv.querySelector('label')) === null || _a === void 0 ? void 0 : _a.textContent) || '' : ''; // Get the label text
    if (labelText === '') {
        // Look for the parent <tr> element to find the sibling <td> element
        const parentTr = element.closest('tr');
        const siblingTd = parentTr ? parentTr.querySelector('td') : null;
        labelText = siblingTd ? siblingTd.textContent || '' : '';
    }
    return labelText; // Return the label text
}
function* include_elements(elements, exceptionList) {
    var _a;
    for (const element of Array.from(elements)) {
        // get the attributes and values of the element
        const attributes = element.attributes;
        const attributeValues = {};
        for (let i = 0; i < attributes.length; i++) {
            const attr = attributes[i];
            attributeValues[attr.name] = attr.value;
        }
        // get the Label Text of the element
        const parentDiv = element.closest('div');
        let labelText = parentDiv ? ((_a = parentDiv.querySelector('label')) === null || _a === void 0 ? void 0 : _a.textContent) || '' : ''; // Get the label text
        if (labelText === '') {
            // Look for the parent <tr> element to find the sibling <td> element
            const parentTr = element.closest('tr');
            const siblingTd = parentTr ? parentTr.querySelector('td') : null;
            labelText = siblingTd ? siblingTd.textContent || '' : '';
        }
        // check if attributeValues is in the exception list
        for (const exception of exceptionList) {
            for (const [key, value] of Object.entries(exception)) {
                if (attributeValues[key] === value) {
                    continue;
                }
            }
        }
        yield [element, labelText];
    }
}
// Load form data once and fill the inputs
function fillForm(filteredElements, data = []) {
    var _a;
    let index = 0; // Initialize index to 0
    for (const [elementData, element] of filteredElements) {
        // Fixed: Use 'element' (the HTMLInputElement) instead of 'inputElement' (the data object)
        element.value = ((_a = data[index]) === null || _a === void 0 ? void 0 : _a.value) || ''; // Fill the input element with the value from data
        index++; // Increment index for the next input element
    }
}
// Function to add new exception to the exception list
function addException(exception) {
    // Check if the exception is already in the list
    const existingException = InclusionList.find((item) => {
        return Object.entries(exception).every(([key, value]) => item[key] === value);
    });
    if (existingException) {
        console.log('Exception already exists in the list:', exception);
        return;
    }
    // Add the new exception to the list
    InclusionList.push(exception);
    // Save the updated exception list to Tampermonkey storage
    GM_setValue('EscapeList', InclusionList);
}
// 2025.04.11: Tweaked style of highlighted elements.
function highlight_form_elements(elements) {
    for (const element of Array.from(elements)) {
        element.style = `
        background-color: #e0f7fa;
        border: 2px solid #4a90e2;
        border-radius: 4px;
        transition: all 0.3s ease;
        `;
        element.placeholder = 'CleverFiller takes over';
    }
}
function hover_overlay_handler(elements, event_handler) {
    for (const element of Array.from(elements)) {
        // 获取元素位置
        const rect = element.getBoundingClientRect();
        // 创建透明覆盖层
        const overlay = document.createElement('div');
        overlay.className = 'cleverfiller-hover-overlay';
        // 设置样式 - 完全透明
        overlay.style.position = 'absolute';
        overlay.style.top = `${rect.top + window.scrollY}px`;
        overlay.style.left = `${rect.left}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        overlay.style.zIndex = '999';
        overlay.style.backgroundColor = 'transparent';
        overlay.style.cursor = 'pointer';
        overlay.style.border = '2px dashed transparent';
        // 悬停效果 - 只在悬停时显示边框
        overlay.addEventListener('mouseover', () => {
            overlay.style.border = '2px dashed #4a90e2';
            overlay.innerHTML = '<div style="background: rgba(74, 144, 226, 0.7); color: white; font-size: 12px; padding: 2px;">Select</div>';
        });
        overlay.addEventListener('mouseout', () => {
            overlay.style.border = '2px dashed transparent';
            overlay.innerHTML = '';
        });
        // 点击事件
        if (event_handler) {
            overlay.addEventListener('click', event_handler); // Attach the event handler if provided
        }
        document.body.appendChild(overlay);
    }
}
function get_window_url() {
    const url = window.location.href; // Get the current URL of the window
    return url; // Return the URL
}
function get_element_attributes(element) {
    const attributes = element.attributes;
    const attributeValues = {};
    for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];
        attributeValues[attr.name] = attr.value;
    }
    return attributeValues; // Return the attribute values as an object
}
// 2025-04-11 @ 11:28:50: Extracted the HTML to a separate file for better maintainability.
function createUI() {
    const container = document.createElement('div');
    const container_html = GM_getResourceText('index');
    container.innerHTML = container_html;
    document.body.appendChild(container);
    const cleverfiller_container = container.querySelector('#cleverfiller-container');
    const heading = container.querySelector('#cf-app-name');
    heading.textContent = `${get_app_info().name}`;
    const api_input = container.querySelector('#cf-api-input');
    api_input.value = GM_getValue('api', '');
    const model_option = container.querySelector('#cf-model-select');
    model_option.value = GM_getValue('model', 'deepseek-chat');
    const version = container.querySelector('#cf-version-info');
    version.textContent = `version: ${get_app_info().version}`;
    const context_input = container.querySelector('#cf-context-textarea');
    context_input.value = GM_getValue('context', '');
    function activate_clever_filler_display(event) {
        if (event.altKey && (event.key.toLowerCase() === 's')) {
            event.preventDefault();
            cleverfiller_container.style.display = 'block';
        }
    }
    document.addEventListener('keydown', activate_clever_filler_display);
    // 2025.04.10: Fully redesigned the header to improve aesthetics and usability.
    const hide_button = cleverfiller_container.querySelector('#cf-hide-button');
    const hightlight_button = cleverfiller_container.querySelector('#cf-enlist-button');
    const submit_button = cleverfiller_container.querySelector('#cf-submit-button');
    setTimeout(() => {
        hide_button.addEventListener('click', () => {
            cleverfiller_container.style.display = 'none';
        });
        hightlight_button.addEventListener('click', () => {
            const inputtable_elements = scan_form_elements();
            highlight_form_elements(inputtable_elements);
            hover_overlay_handler(inputtable_elements);
        });
        submit_button.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
            // save the API key and model to Tampermonkey storage
            GM_setValue('api', api_input.value);
            GM_setValue('model', model_option.value);
            GM_setValue('context', context_input.value);
        }));
    }, 1000);
}
createUI();
