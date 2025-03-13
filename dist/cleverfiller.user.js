/**
// ==UserScript==
// @name         CleverFiller Beta
// @namespace    https://github.com/joolowweng/cleverfiller
// @version      1.0.2
// @description  A tampermonkey script that fills form fields, using deepseek to find the best match data for the field.
// @author       Joolowweng
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/joolowweng/cleverfiller/main/dist/cleverfiller.user.js
// @updateURL    https://raw.githubusercontent.com/joolowweng/cleverfiller/main/dist/cleverfiller.user.js
// @noframes     true
// @match        https://banweb.cityu.edu.hk/*
// @match        https://www38.polyu.edu.hk/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_info
// ==/UserScript==
*/
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
// get the version of the script by
function getVersion() {
    return GM_info.script.version;
}
function callDeepSeekAPI(prompt) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = 'https://api.deepseek.com/v1/chat/completions';
        const apiKey = GM_getValue('api', '');
        const model = GM_getValue('model', 'deepseek-chat');
        const requestData = {
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            stream: false,
        };
        try {
            // @ts-ignore
            const response = yield new Promise((resolve, reject) => {
                // @ts-ignore
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    data: JSON.stringify(requestData),
                    // @ts-ignore
                    onload: function (response) {
                        if (response.status === 200) {
                            resolve(JSON.parse(response.responseText));
                        }
                        else {
                            reject(new Error(`API request failed with status ${response.status}`));
                        }
                    },
                    // @ts-ignore
                    onerror: function (error) {
                        reject(new Error(`API request error: ${error}`));
                    }
                });
            });
            return response;
        }
        catch (error) {
            console.error('Error calling DeepSeek API:', error);
            throw error; // Re-throw to allow caller to handle the error
        }
    });
}
// Function to parse the response from DeepSeek API
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
function createPrompt(context, formData = []) {
    const prompt = `
        你是一个JSON数据处理机器人, 需要直接输出填充后的JSON, **不要任何解释**.

        **工作流程**:
        1. 解析文本信息
        2. 严格匹配JSON字段
        3. 仅修改value值
        4. 返回标准JSON格式

        **要求**:
        1. 仔细阅读用户提供的文本, 识别与每个JSON对象的labelText, name, type字段相关的信息
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
// function to create a UI for the user to input parameters
function createUI() {
    var _a, _b, _c;
    // Create main container
    // Create main container
    const container = document.createElement('div');
    container.id = 'cleverfiller-container';
    container.style.width = '300px';
    container.style.position = 'fixed';
    container.style.top = '10px';
    container.style.right = '10px';
    container.style.backgroundColor = 'white';
    container.style.border = '1px solid black';
    container.style.borderRadius = '5px';
    container.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
    container.style.zIndex = '9999';
    container.style.transition = 'all 0.3s ease-in-out';
    container.style.overflow = 'hidden';
    // Create collapsed button (initially hidden)
    const collapsedButton = document.createElement('button');
    collapsedButton.textContent = 'CleverFiller Settings';
    collapsedButton.style.position = 'fixed';
    collapsedButton.style.top = '10px';
    collapsedButton.style.right = '10px';
    collapsedButton.style.zIndex = '9999';
    collapsedButton.style.display = 'none';
    collapsedButton.style.padding = '5px 10px';
    collapsedButton.style.cursor = 'pointer';
    document.body.appendChild(collapsedButton);
    // Create header
    const header = document.createElement('div');
    header.style.padding = '10px';
    header.style.backgroundColor = '#f0f0f0';
    header.style.borderBottom = '1px solid #ddd';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.innerHTML = `<h3 style="margin: 0">CleverFiller ${getVersion()}</h3>`;
    // Create toggle button
    const toggleButton = document.createElement('button');
    toggleButton.textContent = 'Hide';
    toggleButton.style.padding = '3px 8px';
    toggleButton.style.cursor = 'pointer';
    header.appendChild(toggleButton);
    // Create content container
    const content = document.createElement('div');
    content.id = 'cleverfiller-settings';
    content.style.padding = '10px';
    const savedModel = GM_getValue('model', 'deepseek-chat');
    content.innerHTML = `
        <label for="api">Deepseek API:</label><br>
        <input type="text" id="api" value=${GM_getValue('api', '')}><br><br>
        <label for="model">Model:</label><br>
        <select id="model">
            <option value="deepseek-chat" ${savedModel === 'deepseek-chat' ? 'selected' : ''}>DeepSeek Chat</option>
            <option value="deepseek-reasoner" ${savedModel === 'deepseek-reasoner' ? 'selected' : ''}>DeepSeek Reasoner</option>
        </select><br><br>
        <label for="context">Context:</label><br>
        <textarea id="context" rows="4" cols="30" style="resize: none;">${GM_getValue('context', '')}</textarea><br><br>
        <label for="exception">Exception List:</label><br>
        <textarea id="exception" rows="4" cols="30" style="resize: none;">${JSON.stringify(exceptionList, null, 2)}</textarea><br><br>
        <label for="ai">AI Parsing:</label>
        <input type="checkbox" id="ai" ${GM_getValue('ai', false) ? 'checked' : ''}><br><br>
        <div style="display: flex; justify-content: space-between;">
        <button id="submit">Save</button>
        <button id="hightlight">Highlight</button>
        <button id="run">Run</button>
        </div>
    `;
    // Add elements to container
    container.appendChild(header);
    container.appendChild(content);
    document.body.appendChild(container);
    // Toggle visibility functionality
    toggleButton.addEventListener('click', () => {
        container.style.display = 'none';
        collapsedButton.style.display = 'block';
    });
    collapsedButton.addEventListener('click', () => {
        container.style.display = 'block';
        collapsedButton.style.display = 'none';
    });
    let formData = []; // Initialize formData as an empty array with type
    // Add event listener for save button
    (_a = document.getElementById('submit')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
        const api = document.getElementById('api').value;
        const model = document.getElementById('model').value;
        const context = document.getElementById('context').value;
        const exception = document.getElementById('exception').value;
        const ai = document.getElementById('ai').checked;
        GM_setValue('api', api); // Save API to Tampermonkey storage
        GM_setValue('model', model); // Save model to Tampermonkey storage
        GM_setValue('context', context); // Save context to Tampermonkey storage
        GM_setValue('ai', ai); // Save AI parsing option to Tampermonkey storage
        GM_setValue('exceptionList', JSON.parse(exception)); // Save exception list to Tampermonkey storage
        if (context == '') {
            alert('Context cannot be empty!');
            return;
        }
    });
    // Add event listener for highlight button
    (_b = document.getElementById('hightlight')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => {
        const inputs = scanFormElements();
        formData = highlightFormElements(inputs, exceptionList); // make formData a global variable
        console.log('Filtered elements:', formData);
    });
    // Add event listener for run button
    (_c = document.getElementById('run')) === null || _c === void 0 ? void 0 : _c.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
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
            const prompt = createPrompt(context, formData); // Call the function to create the prompt
            console.log('Generated prompt:', prompt);
            const response = yield callDeepSeekAPI(prompt); // Call the DeepSeek API
            console.log('DeepSeek API response:', response);
            const parsedResponse = parseAIResponse(response); // Parse the API response
            console.log('Parsed response:', parsedResponse);
            fillForm(filterElements(inputs, exceptionList), parsedResponse); // Call the function to fill the form
        }
    }));
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        createUI(); // Call the function to create the UI
    });
}
main();
