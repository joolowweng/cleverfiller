// ==UserScript==
// @name         CleverFiller Beta
// @namespace    https://github.com/joolowweng/cleverfiller
// @version      1.1.0
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
// @grant        GM_info
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
// Add an exception list for attribute name and its value
const exceptionList = GM_getValue('exceptionList', { labelText: [], id: [], name: [], type: [], maxlength: [-1] });
function get_app_info() {
    // get the version of the script
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
// Soon to be deprecated
function parseAIResponse(response) {
    var _a, _b, _c;
    try {
        // Extract content using optional chaining for safety
        const content = (_c = (_b = (_a = response === null || response === void 0 ? void 0 : response.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
        if (!content) {
            throw new Error('Invalid API response format');
        }
        else {
            const cleanStringData = content.substring(content.indexOf('['), content.lastIndexOf(']') + 1);
            return JSON.parse(cleanStringData);
        }
    }
    catch (error) {
        console.error('Failed to parse API response:', error);
        return [];
    }
}
// scan the page to find the form elements
function scanFormElements() {
    // Get all input, textarea, select elements
    const allInputs = document.querySelectorAll('input, textarea, select');
    // Convert to array and filter out elements inside #cleverfiller-settings
    const filteredInputs = Array.from(allInputs).filter(input => {
        return !input.closest('#cleverfiller-settings');
    });
    // Cast back to NodeListOf<HTMLInputElement> for type compatibility
    return filteredInputs;
}
function* filterElements(elements, exceptionList) {
    var _a, _b, _c, _d, _e, _f;
    for (const element of Array.from(elements)) {
        // Get the name, type, maxlength of the input element
        const name = element.name || '';
        const type = element.type || '';
        const id = element.id || '';
        const maxlength = element.maxLength || 0; // Use 0 if maxLength is not set
        const parentDiv = element.closest('div'); // Get the label text
        let labelText = parentDiv ? ((_a = parentDiv.querySelector('label')) === null || _a === void 0 ? void 0 : _a.textContent) || '' : ''; // Get the label text
        if (labelText === '') {
            // Look for the parent <tr> element to find the sibling <td> element
            const parentTr = element.closest('tr');
            const siblingTd = parentTr ? parentTr.querySelector('td') : null;
            labelText = siblingTd ? siblingTd.textContent || '' : '';
        }
        // Check if any field matches an exception
        if (((_b = exceptionList.labelText) === null || _b === void 0 ? void 0 : _b.includes(labelText)) ||
            ((_c = exceptionList.id) === null || _c === void 0 ? void 0 : _c.includes(id)) ||
            ((_d = exceptionList.name) === null || _d === void 0 ? void 0 : _d.includes(name)) ||
            ((_e = exceptionList.type) === null || _e === void 0 ? void 0 : _e.includes(type)) ||
            ((_f = exceptionList.maxlength) === null || _f === void 0 ? void 0 : _f.includes(maxlength))) {
            // If any field is in the exception list, skip this element
            console.log(`Skipping element: {labelText: ${labelText}, name: ${name}, id: ${id}, type: ${type}}`);
            continue;
        }
        // Create a JSON object for the input element
        const elementData = {
            labelText: labelText,
            name: name,
            id: id,
            type: type,
            maxlength: maxlength,
            value: '',
        };
        yield [elementData, element];
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
    Object.keys(exception).forEach(key => {
        if (!exceptionList[key]) {
            exceptionList[key] = [];
        }
        // Handle both array and single value cases
        if (Array.isArray(exception[key])) {
            exceptionList[key].push(...exception[key]);
        }
        else {
            exceptionList[key].push(exception[key]);
        }
    });
    GM_setValue('exceptionList', exceptionList);
}
// Function to highlight the form elements
function highlightFormElements(elements, exceptionList) {
    var _a, _b, _c;
    const formData = []; // Specify the correct object type
    for (const [elementData, element] of filterElements(elements, exceptionList)) { // Call the filterElements function to filter the elements
        element.style.border = '2px solid red';
        element.style.backgroundColor = 'yellow';
        element.placeholder = 'Detected by CleverFiller';
        // create a button to add the element to the exception list
        const addByName = document.createElement('button');
        const addById = document.createElement('button');
        const addByLabel = document.createElement('button');
        addByName.textContent = 'Exclude by Name: ' + (elementData.name ? elementData.name : 'N/A');
        addById.textContent = 'Exclude by ID: ' + (elementData.id ? elementData.id : 'N/A');
        addByLabel.textContent = 'Exclude by Label: ' + (elementData.labelText ? elementData.labelText : 'N/A');
        addByName.style.marginLeft = '5px';
        addById.style.marginLeft = '5px';
        addByLabel.style.marginLeft = '5px';
        (_a = element.parentElement) === null || _a === void 0 ? void 0 : _a.appendChild(addByName);
        (_b = element.parentElement) === null || _b === void 0 ? void 0 : _b.appendChild(addById);
        (_c = element.parentElement) === null || _c === void 0 ? void 0 : _c.appendChild(addByLabel);
        addByName.addEventListener('click', () => {
            const exception = { name: elementData.name.trim() };
            addException(exception);
            alert(`${elementData.labelText ? elementData.labelText : 'Element'} has been added to the exception list.`);
            // refresh the page to apply the changes
            location.reload();
        });
        addById.addEventListener('click', () => {
            const exception = { id: elementData.id.trim() };
            addException(exception);
            alert(`${elementData.labelText ? elementData.labelText : 'Element'} has been added to the exception list.`);
            // refresh the page to apply the changes
            location.reload();
        });
        addByLabel.addEventListener('click', () => {
            const exception = { labelText: elementData.labelText.trim() };
            addException(exception);
            alert(`${elementData.labelText ? elementData.labelText : 'Element'} has been added to the exception list.`);
            // refresh the page to apply the changes
            location.reload();
        });
        formData.push(elementData); // Push the element data to the formData array
    }
    return formData; // Return the formData array
}
function createUI() {
    var _a, _b;
    // 2025.04.10
    // - Added keyboard shortcut (Alt + S) to toggle the UI.
    function create_container() {
        const container = document.createElement('div');
        container.id = 'cleverfiller-container';
        container.style = `
        display: none;
        width: 350px;
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #ffffff;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        z-index: 9999;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        max-height: 100vh;
        overflow-y: auto;
        color: #333333;
        z-index: 9999;
        `;
        function event_listener(event) {
            if (event.altKey && event.key === 's') {
                event.preventDefault();
                container.style.display = 'block';
            }
        }
        document.addEventListener('keydown', event_listener);
        return container;
    }
    // 2025.04.10
    // - Fully redesigned the header to improve aesthetics and usability.
    function create_inner_header(container) {
        const inner_header = document.createElement('div');
        inner_header.id = 'cleverfiller-inner-header';
        inner_header.style = `
        padding: 10px;
        margin: 0;
        background-color: #4a90e2;
        background-image: linear-gradient(135deg, #4a90e2, #7986cb);
        color: white;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        border-top-left-radius: 5px;
        border-top-right-radius: 5px;
        `;
        inner_header.innerHTML = `
        <h3>${get_app_info().name}</h3><span style="font-size: 12px;">v${get_app_info().version}</span>
        `;
        const toggleButton = document.createElement('button');
        // Create toggle button
        toggleButton.textContent = 'Hide';
        toggleButton.style = `
        padding: 6px 12px;
        font-size: 14px;
        font-weight: 500;
        background-color: rgba(255, 255, 255, 0.2);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        outline: none;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        `;
        toggleButton.addEventListener('mouseover', () => {
            toggleButton.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
        });
        toggleButton.addEventListener('mouseout', () => {
            toggleButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        });
        toggleButton.addEventListener('click', () => {
            container.style.display = 'none';
        });
        inner_header.appendChild(toggleButton);
        return inner_header;
    }
    // 2025.04.10
    // - Redesigned a modern, material-design styled settings interface.
    function create_inner_body() {
        const inner_body = document.createElement('div');
        inner_body.id = 'cleverfiller-inner-body';
        inner_body.style = `
        padding: 10px;
        background-color: #ffffff;
        color: #333333;
        `;
        // Create a modern, material-design styled settings interface
        inner_body.innerHTML = `
        <div style="padding: 16px;">
            <div class="cf-setting-group">
            <h3 style="margin: 0 0 16px; color: #4a90e2; font-weight: 500; font-size: 18px;">Settings</h3>

            <div class="cf-input-field" style="margin-bottom: 16px;">
                <label for="api" style="display: block; margin-bottom: 6px; color: #555; font-size: 14px;">Deepseek API Key</label>
                <input value=${GM_getValue('api', '')} type="text" id="api" placeholder="Enter your API key" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: border-color 0.2s ease;">
            </div>

            <div class="cf-input-field" style="margin-bottom: 16px;">
                <label for="model" style="display: block; margin-bottom: 6px; color: #555; font-size: 14px;">Model</label>
                <select id="model" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 14px; background-color: white; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <option ${GM_getValue('model', 'deepseek-chat') === 'deepseek-chat' ? 'selected' : ''} value="deepseek-chat">DeepSeek Chat</option>
                <option ${GM_getValue('model', 'deepseek-reasoner') === 'deepseek-reasoner' ? 'selected' : ''} value="deepseek-reasoner">DeepSeek Reasoner</option>
                </select>
            </div>

            <div class="cf-input-field" style="margin-bottom: 16px;">
                <label for="context" style="display: block; margin-bottom: 6px; color: #555; font-size: 14px;">Context</label>
                <textarea id="context" rows="4" placeholder="Enter context information" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 14px; resize: none; font-family: inherit; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">${GM_getValue('context', '')}</textarea>
            </div>

            <div class="cf-input-field" style="margin-bottom: 16px;">
                <label for="exception" style="display: block; margin-bottom: 6px; color: #555; font-size: 14px;">Exception List</label>
                <textarea id="exception" rows="4" style="width: 100%; padding: 10px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 14px; resize: none; font-family: monospace; font-size: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);"></textarea>
            </div>

            <div class="cf-toggle-field" style="display: flex; align-items: center; margin-bottom: 16px;">
                <label for="ai" style="flex: 1; color: #555; font-size: 14px;">Enable AI Parsing</label>
                <label class="switch" style="position: relative; display: inline-block; width: 40px; height: 20px;">
                <input ${GM_getValue('ai', false) ? 'checked' : ''} type="checkbox" id="ai" style="opacity: 0; width: 0; height: 0;">
                <span class="slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cccccc; border-radius: 20px; transition: .3s;"></span>
                </label>
            </div>
            </div>

            <div class="cf-button-group" style="display: flex; justify-content: space-between; margin-top: 24px;">
            <button id="cf-submit" style="padding: 10px 16px; background-color: #4a90e2; color: white; border: none; border-radius: 4px; font-weight: 500; cursor: pointer; transition: background-color 0.2s ease;">Save</button>
            <button id="hightlight" style="padding: 10px 16px; background-color: #f0f0f0; color: #333; border: none; border-radius: 4px; font-weight: 500; cursor: pointer; transition: background-color 0.2s ease;">Highlight</button>
            <button id="run" style="padding: 10px 16px; background-color: #4caf50; color: white; border: none; border-radius: 4px; font-weight: 500; cursor: pointer; transition: background-color 0.2s ease;">Run</button>
            </div>

            <div class="cf-loading" style="display: flex; align-items: center; margin-top: 16px; justify-content: center;">
            <svg id="spinner" style="display: none; width: 24px; height: 24px;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="#4a90e2" stroke-width="4" fill="none" stroke-dasharray="60 30" />
            </svg>
            <span id="loading-text" style="display: none; margin-left: 10px; color: #4a90e2; font-size: 14px;">Processing...</span>
            </div>
        </div>

        <style>
            #cleverfiller-inner-body input:focus,
            #cleverfiller-inner-body textarea:focus,
            #cleverfiller-inner-body select:focus {
            outline: none;
            border-color: #4a90e2;
            box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
            }

            #cleverfiller-inner-body button:hover {
            opacity: 0.9;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            }

            #cleverfiller-inner-body button:active {
            transform: translateY(1px);
            }

            #submit:hover { background-color: #3a80d2; }
            #hightlight:hover { background-color: #e0e0e0; }
            #run:hover { background-color: #3c9f40; }

            /* Toggle switch styles */
            input#ai:checked + span.slider {
                background-color: #4a90e2;
            }

            input#ai:checked + span.slider:before {
                transform: translateX(20px);
            }

            span.slider:before {
                position: absolute;
                content: "";
                height: 16px;
                width: 16px;
                left: 2px;
                bottom: 2px;
                background-color: white;
                border-radius: 50%;
                transition: .3s;
            }
        </style>
        `;
        // Add an event listener to update the slider background when checkbox state changes
        setTimeout(() => {
            const aiToggle = document.getElementById('ai');
            if (aiToggle) {
                aiToggle.addEventListener('change', function () {
                    const slider = this.nextElementSibling;
                    if (this.checked) {
                        slider.style.backgroundColor = '#4a90e2';
                    }
                    else {
                        slider.style.backgroundColor = '#cccccc';
                    }
                });
            }
        }, 100);
        function submitForm(event) {
            event.preventDefault(); // Prevent the default form submission
            for (const id of ['api', 'model', 'context']) {
                const input = document.getElementById(id);
                if (input) {
                    const value = input.value.trim();
                    if (value === '') {
                        alert(`${id} cannot be empty!`);
                        return;
                    }
                }
                GM_setValue(id, document.getElementById(id).value); // Save to Tampermonkey storage
            }
            const exception = document.getElementById('exception').value;
            const ai = document.getElementById('ai').checked;
            GM_setValue('ai', ai); // Save AI parsing option to Tampermonkey storage
            GM_setValue('exceptionList', JSON.parse(exception)); // Save exception list to Tampermonkey storage
        }
        // Add event listener after the element is appended to the document
        setTimeout(() => {
            const submitButton = document.getElementById('cf-submit');
            if (submitButton) {
                submitButton.addEventListener('click', submitForm);
            }
        }, 100);
        return inner_body;
    }
    // Initialize the UI
    const container = create_container();
    const header = create_inner_header(container);
    const inner_body = create_inner_body(); // Create the inner body element
    container.appendChild(header);
    container.appendChild(inner_body);
    document.body.appendChild(container);
    let formData = []; // Initialize formData as an empty array with type
    // Add event listener for highlight button
    (_a = document.getElementById('hightlight')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
        const inputs = scanFormElements();
        formData = highlightFormElements(inputs, exceptionList); // make formData a global variable
        console.log('Filtered elements:', formData);
    });
    // Add event listener for run button
    (_b = document.getElementById('run')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
        const api = document.getElementById('api').value;
        const model = document.getElementById('model').value;
        const context = document.getElementById('context').value;
        switch (true) {
            case (api == ''):
                alert('API cannot be empty!');
                return;
            case (model == ''):
                alert('Model cannot be empty!');
                return;
        }
        const inputs = scanFormElements(); // Call the function to scan the form elements
        if (GM_getValue('ai', false)) {
            if (context == '' || context == null) {
                alert('Context cannot be empty!');
                return;
            }
            const prompt = create_prompt(context, formData); // Call the function to create the prompt
            console.log('Generated prompt:', prompt);
            const response = yield call_deepseek_api(prompt); // Call the DeepSeek API
            console.log('DeepSeek API response:', response);
            const parsedResponse = parseAIResponse(response); // Parse the API response
            console.log('Parsed response:', parsedResponse);
            fillForm(filterElements(inputs, exceptionList), parsedResponse); // Call the function to fill the form
        }
    }));
}
createUI();
