// ==UserScript==
// @name         CleverFiller
// @namespace    https://github.com/joolowweng/cleverfiller
// @version      1.3.1
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
// @resource     index https://raw.githubusercontent.com/joolowweng/cleverfiller/dev/html/index.html?ts=1.3.1
// @run-at       document-start
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
const EnlistArray = [];
const ElementCache = [];
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
// 2025-04-11 @ 21:16:35: Changed the prompt and improved the parsing logic.
function create_prompt(context, formData) {
    const prompt = `
        你是一个Web数据处理专家, 需要根据网页表单的字段信息, 结合我提供的文本信息, 判断这些字段的值应该是什么.
        直接返回字符串格式的值, **不要任何解释**.

        **工作流程**:
        1. 仔细阅读用户提供的文本, 识别与每个JSON对象字段相关的信息
        2. 如果文本信息没有明确标明的值或多个值, 请根据上下文进行合理推测.
        3. 如果推断的值不确定, 请返回空字符串.
        4. 如果文本信息中没有相关信息, 请返回空字符串.

        -----------------------

        **文本信息**:
        ${context}

        **JSON格式的字段信息**:
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
        return msg_content.trim();
    }
    catch (error) {
        console.error('Failed to parse API response:', error);
        return '';
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
// TODO: Improve the logic to find the label text of the element.
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
function hover_overlay_handler(elements) {
    for (const element of Array.from(elements)) {
        const rect = element.getBoundingClientRect();
        // Create overlay element
        const overlay = document.createElement('div');
        overlay.className = 'cleverfiller-hover-overlay';
        // Position and size - adding padding to make it easier to click
        overlay.style.position = 'absolute';
        overlay.style.top = `${rect.top + window.scrollY - 5}px`; // 5px padding on top
        overlay.style.left = `${rect.left - 5}px`; // 5px padding on left
        overlay.style.width = `${rect.width + 10}px`; // Add 10px total width (5px on each side)
        overlay.style.height = `${rect.height + 10}px`; // Add 10px total height (5px on each side)
        overlay.style.zIndex = '999';
        overlay.style.backgroundColor = 'rgba(74, 144, 226, 0.1)'; // Slight background for better visibility
        overlay.style.cursor = 'pointer';
        overlay.style.border = '2px dashed transparent';
        overlay.style.boxSizing = 'border-box'; // Ensure padding doesn't affect overall size
        // Hover effects - improved visibility
        overlay.addEventListener('mouseover', () => {
            overlay.style.border = '2px dashed #4a90e2';
            overlay.style.backgroundColor = 'rgba(74, 144, 226, 0.2)'; // More noticeable on hover
            overlay.innerHTML = '<div style="background: rgba(74, 144, 226, 0.8); color: white; font-size: 12px; padding: 4px; border-radius: 3px; position: absolute; top: 0; right: 0;">Select</div>';
        });
        overlay.addEventListener('mouseout', () => {
            overlay.style.border = '2px dashed transparent';
            overlay.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
            overlay.innerHTML = '';
        });
        overlay.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            overlay.remove(); // Remove the overlay on click
            enlist_element(element); // Enlist the element
        });
        document.body.appendChild(overlay);
    }
}
function enlist_element(element) {
    // Cache the enlisted HTML element in the array
    // Generate a unique identifier for this element to prevent duplicates
    let attributeValues = get_element_attributes(element);
    // 定义需要排除的属性列表
    const excludeAttributes = [
        'style',
        'class',
        'value',
        'tabindex',
        'disabled',
        'readonly',
        'autocomplete',
        'placeholder',
        'aria-checked',
        'aria-selected',
        'aria-expanded',
        'aria-pressed',
    ];
    // Exclude the specified attributes from the attributeValues object
    excludeAttributes.forEach(attr => {
        if (attr in attributeValues) {
            delete attributeValues[attr];
        }
    });
    // exclude all attributes that start with 'data-'
    Object.keys(attributeValues).forEach(key => {
        if (key.startsWith('data-')) {
            delete attributeValues[key];
        }
    });
    const url = get_window_url();
    const labelText = get_label_text(element);
    // create a unique signature for the element
    const elementSignature = `${url}|${labelText}|${JSON.stringify(attributeValues)}`;
    // Check if the element already exists in the array
    const alreadyExists = EnlistArray.some(item => {
        const itemSignature = `${item.url}|${item.labelText}|${JSON.stringify(item.attributeValues)}`;
        return itemSignature === elementSignature;
    });
    if (!alreadyExists) {
        const data = {
            url: url,
            labelText: labelText,
            attributeValues: attributeValues
        };
        EnlistArray.push(data);
        ElementCache.push(element); // Add the element to the cache
        // GM_setValue('enlist', EnlistArray);
        console.log('Enlisted element:', data);
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
function fill_form(element, value) {
    // Fill the form element with the value
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = value;
    }
    else if (element.tagName === 'SELECT') {
        const selectElement = element;
        const optionToSelect = Array.from(selectElement.options).find(option => option.value === value);
        if (optionToSelect) {
            selectElement.value = optionToSelect.value;
        }
    }
}
// 2025-04-11 @ 11:28:50: Extracted the HTML to a separate file for better maintainability.
function createUI() {
    const container = document.createElement('div');
    const container_html = GM_getResourceText('index');
    container.innerHTML = container_html;
    document.body.appendChild(container);
    const cleverfiller_container = container.querySelector('#cleverfiller-container');
    cleverfiller_container.style.display = 'block';
    const heading = container.querySelector('#cf-app-name');
    heading.textContent = `${get_app_info().name}`;
    const api_input = container.querySelector('#cf-api-input');
    api_input.value = GM_getValue('api', '');
    // don't show the complete api key in the input field
    const model_option = container.querySelector('#cf-model-select');
    model_option.value = GM_getValue('model', 'deepseek-chat');
    const version = container.querySelector('#cf-version-info');
    version.textContent = `version: ${get_app_info().version}`;
    const context_input = container.querySelector('#cf-context-textarea');
    context_input.value = GM_getValue('context', '');
    const loadingText = cleverfiller_container.querySelector('#cf-console-log');
    loadingText.textContent = 'Press Alt + S to show panel';
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
    const run_button = cleverfiller_container.querySelector('#cf-run-button');
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
            // Get elements for animation
            const loadingText = cleverfiller_container.querySelector('#cf-console-log');
            // First show saving state
            loadingText.textContent = 'Saving...';
            loadingText.style.color = '#4a90e2'; // Blue color for loading
            submit_button.disabled = true;
            // Small delay to show the saving state
            setTimeout(() => {
                // Save the settings
                GM_setValue('api', api_input.value);
                GM_setValue('model', model_option.value);
                GM_setValue('context', context_input.value);
                // Show success state
                loadingText.style.color = '#4CAF50'; // Green color for success
                loadingText.textContent = 'Saved';
                // Clear the message after .5 seconds
                setTimeout(() => {
                    loadingText.textContent = ''; // Clear text
                    submit_button.disabled = false;
                }, 1000);
            }, 1000); // Short delay to make the animation visible
        }));
        run_button.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
            // Get elements for animation
            const loadingText = cleverfiller_container.querySelector('#cf-console-log');
            // Disable the button while processing
            run_button.disabled = true;
            // Validate settings
            if (api_input.value === '' || context_input.value === '') {
                loadingText.textContent = 'Incorrect API or empty context';
                loadingText.style.color = '#f44336'; // Red color for error
                setTimeout(() => {
                    loadingText.textContent = '';
                    run_button.disabled = false;
                }, 2000);
                return;
            }
            // Check if elements are available
            if (ElementCache.length === 0) {
                loadingText.textContent = 'No form elements selected. Click Enlist first.';
                loadingText.style.color = '#ff9800'; // Warning color
                setTimeout(() => {
                    loadingText.textContent = '';
                    run_button.disabled = false;
                }, 2000);
                return;
            }
            // Show initial count
            loadingText.textContent = `Preparing to fill ${ElementCache.length} form fields...`;
            loadingText.style.color = '#4a90e2'; // Blue color for loading
            // Short delay so user can see the initial count
            yield new Promise(resolve => setTimeout(resolve, 800));
            try {
                // Show loading indicators for all fields
                for (let i = 0; i < ElementCache.length; i++) {
                    const element = ElementCache[i];
                    element.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
                    element.style.border = '2px solid #4a90e2';
                }
                // Process each field with AI
                for (let i = 0; i < ElementCache.length; i++) {
                    const element = ElementCache[i];
                    const enlisted_element = EnlistArray[i].attributeValues;
                    // Update console with current field
                    loadingText.textContent = `Processing field ${i + 1}/${ElementCache.length}...`;
                    try {
                        const prompt = create_prompt(context_input.value, enlisted_element);
                        // Show specific field information
                        if (element.id || element.name) {
                            loadingText.textContent = `Processing ${element.id || element.name} (${i + 1}/${ElementCache.length})...`;
                        }
                        console.log('[CleverFiller] Prompt:', prompt);
                        const response = yield call_deepseek_api(prompt);
                        const fieldValue = parse_ai_response(response);
                        console.log('[CleverFiller] Field Value:', fieldValue);
                        fill_form(element, fieldValue); // Fill the form element with the value
                    }
                    catch (fieldError) {
                        // Error handling remains the same...
                    }
                }
                // Show success
            }
            catch (error) {
                // Handle errors
                console.error('Error filling form:', error);
                loadingText.textContent = 'Check the console for errors.';
                loadingText.style.color = '#f44336'; // Red for error
            }
            finally {
                // Always re-enable the button and clear message after delay
                setTimeout(() => {
                    run_button.disabled = false;
                    loadingText.textContent = '';
                }, 1000);
            }
        }));
    }, 500);
}
createUI();
