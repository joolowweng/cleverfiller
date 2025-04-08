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

// Add an exception list for attribute name and its value
const exceptionList = GM_getValue('exceptionList', { labelText: [], id: [], name: [], type: [], maxlength: [-1] });

// Declare GM functions for type checking
declare function GM_setValue(key: string, value: any): void;
declare function GM_getValue(key: string, defaultValue?: any): any;
declare var GM_info: {
    script: {
        version: string;
    };
}
// get the version of the script by
function getVersion(): string {
    return GM_info.script.version;
}

async function callDeepSeekAPI(prompt: string): Promise<any> {
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
        const response = await new Promise((resolve, reject) => {
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
                onloadstart: function () {
                    // Show loading spinner
                    const spinner = document.getElementById('spinner') as HTMLElement;
                    const loadingText = document.getElementById('loading-text') as HTMLElement;
                    spinner.style.display = 'inline-block';
                    loadingText.style.display = 'inline-block';
                },
                // @ts-ignore
                onload: function (response) {
                    if (response.status === 200) {
                        resolve(JSON.parse(response.responseText));
                    } else {
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
    } catch (error) {
        console.error('Error calling DeepSeek API:', error);
        throw error; // Re-throw to allow caller to handle the error
    }
}

// Function to parse the response from DeepSeek API
function parseAIResponse(response: any): Array<{ labelText: string; name: string; id: string; type: string; maxlength: number; value: any; }> {
    try {
        // Extract content using optional chaining for safety
        const content = response?.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('Invalid API response format')
        }
        else {
            const cleanStringData = content.substring(content.indexOf('['), content.lastIndexOf(']') + 1);
            return JSON.parse(cleanStringData);
        }
    } catch (error) {
        console.error('Failed to parse API response:', error);
        return [];
    }
}

// scan the page to find the form elements
function scanFormElements(): NodeListOf<HTMLInputElement> {
    // Get all input, textarea, select elements
    const allInputs = document.querySelectorAll<HTMLInputElement>('input, textarea, select');

    // Convert to array and filter out elements inside #cleverfiller-settings
    const filteredInputs = Array.from(allInputs).filter(input => {
        return !input.closest('#cleverfiller-settings');
    });

    // Cast back to NodeListOf<HTMLInputElement> for type compatibility
    return filteredInputs as unknown as NodeListOf<HTMLInputElement>;
}

function* filterElements(elements: NodeListOf<HTMLInputElement>, exceptionList: { [key: string]: any }): Generator<[{ labelText: string; name: string; id: string; type: string; maxlength: number; value: any; }, HTMLInputElement]> {

    for (const element of Array.from(elements)) {
        // Get the name, type, maxlength of the input element
        const name = element.name || '';
        const type = element.type || '';
        const id = element.id || '';
        const maxlength = element.maxLength || 0; // Use 0 if maxLength is not set
        const parentDiv = element.closest('div'); // Get the label text
        let labelText = parentDiv ? parentDiv.querySelector('label')?.textContent || '' : ''; // Get the label text
        if (labelText === '') {

            // Look for the parent <tr> element to find the sibling <td> element
            const parentTr = element.closest('tr');
            const siblingTd = parentTr ? parentTr.querySelector('td') : null;
            labelText = siblingTd ? siblingTd.textContent || '' : '';

        }
        // Check if any field matches an exception
        if (exceptionList.labelText?.includes(labelText) ||
            exceptionList.id?.includes(id) ||
            exceptionList.name?.includes(name) ||
            exceptionList.type?.includes(type) ||
            exceptionList.maxlength?.includes(maxlength)) {
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
function fillForm(filteredElements: Generator<[{ labelText: string; name: string; id: string; type: string; maxlength: number; value: any; }, HTMLInputElement]>, data: Array<{ labelText: string; name: string; id: string; type: string; maxlength: number; value: any; }> = []): void {
    let index = 0; // Initialize index to 0
    for (const [elementData, element] of filteredElements) {
        // Fixed: Use 'element' (the HTMLInputElement) instead of 'inputElement' (the data object)
        element.value = data[index]?.value || ''; // Fill the input element with the value from data
        index++; // Increment index for the next input element
    }
}

// Function to add new exception to the exception list
function addException(exception: { [key: string]: any }): void {

    Object.keys(exception).forEach(key => {
        if (!exceptionList[key]) {
            exceptionList[key] = [];
        }

        // Handle both array and single value cases
        if (Array.isArray(exception[key])) {
            exceptionList[key].push(...exception[key]);
        } else {
            exceptionList[key].push(exception[key]);
        }
    });

    GM_setValue('exceptionList', exceptionList);
}

function createPrompt(context: string, formData: Array<{ labelText: string; name: string; id: string; type: string; maxlength: number; value: any; }> = []): string {
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
function highlightFormElements(elements: NodeListOf<HTMLInputElement>, exceptionList: { [key: string]: any }): Array<{ labelText: string; name: string; id: string; type: string; maxlength: number; value: any; }> {
    const formData: Array<{ labelText: string; name: string; id: string; type: string; maxlength: number; value: any; }> = []; // Specify the correct object type

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

        element.parentElement?.appendChild(addByName);
        element.parentElement?.appendChild(addById);
        element.parentElement?.appendChild(addByLabel);

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
function createUI(): void {
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
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            #spinner {
                animation: spin 1.5s linear infinite;
            }
        </style>
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
        <div>
            <svg id="spinner" style="display: none; width: 24px; height: 24px;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="#0066cc" stroke-width="4" fill="none" stroke-dasharray="60 30" />
            </svg>
            <span id="loading-text" style="display: none;">Loading...</span>
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

    let formData: Array<{ labelText: string; name: string; id: string; type: string; maxlength: number; value: any; }> = []; // Initialize formData as an empty array with type
    // Add event listener for save button
    document.getElementById('submit')?.addEventListener('click', () => {
        const api = (document.getElementById('api') as HTMLInputElement).value;
        const model = (document.getElementById('model') as HTMLSelectElement).value;
        const context = (document.getElementById('context') as HTMLTextAreaElement).value;
        const exception = (document.getElementById('exception') as HTMLTextAreaElement).value;
        const ai = (document.getElementById('ai') as HTMLInputElement).checked;
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
    document.getElementById('hightlight')?.addEventListener('click', () => {
        const inputs = scanFormElements();

        formData = highlightFormElements(inputs, exceptionList); // make formData a global variable

        console.log('Filtered elements:', formData);
    });

    // Add event listener for run button
    document.getElementById('run')?.addEventListener('click', async () => {
        const api = (document.getElementById('api') as HTMLInputElement).value;
        const model = (document.getElementById('model') as HTMLSelectElement).value;
        const context = (document.getElementById('context') as HTMLTextAreaElement).value;
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
            const response = await callDeepSeekAPI(prompt); // Call the DeepSeek API
            console.log('DeepSeek API response:', response);
            const parsedResponse = parseAIResponse(response); // Parse the API response
            console.log('Parsed response:', parsedResponse);
            fillForm(filterElements(inputs, exceptionList), parsedResponse); // Call the function to fill the form
        }
    });
}


async function main() {

    createUI(); // Call the function to create the UI

}

main();