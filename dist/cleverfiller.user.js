// ==UserScript==
// @name         CleverFiller
// @namespace    https://github.com/joolowweng/cleverfiller
// @version      1.4.0
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
// EnlistArray: Array to store enlisted elements
const EnlistArray = GM_getValue('enlist', []);
// ElementCache: Array to store the fillable elements that are currently in the DOM
const ElementCache = [];
// General Utility Functions
// --------------------------------------------------------
function get_app_info() {
    const script = GM_info.script;
    const name = script.name;
    const version = script.version;
    return { name, version };
}
function get_window_url() {
    const url = window.location.href; // Get the current URL of the window
    return url; // Return the URL
}
// -----------------------------------------------------------
// AI Part
// -------------------------------------------------------
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
// -------------------------------------------------------
// UI Part
// -------------------------------------------------------
// 2025.04.11: Tweaked style of highlighted elements.
function highlight_form_elements(elements) {
    for (const element of Array.from(elements)) {
        element.style = `
        background-color: #e0f7fa;
        border: 2px solid #4a90e2;
        border-radius: 4px;
        transition: all 0.3s ease;
        `;
    }
}
function hover_overlay_handler(elements) {
    // Clear existing overlays if any
    const existingOverlays = document.querySelectorAll('.cleverfiller-hover-overlay');
    existingOverlays.forEach(overlay => overlay.remove());
    for (const element of Array.from(elements)) {
        // See if the element is already enlisted
        const elementSignature = create_element_signature(element);
        let isAlreadyEnlisted = false;
        for (const enlistedElement of EnlistArray) {
            // Compare the signatures of the enlisted elements with the current element
            const enlistedSignature = `${enlistedElement.url}|${enlistedElement.labelText}|${JSON.stringify(enlistedElement.attributeValues)}`;
            if (elementSignature === enlistedSignature) {
                isAlreadyEnlisted = true;
                break;
            }
        }
        // If the element is already enlisted, create a remove hover overlay
        if (isAlreadyEnlisted) {
            // Create a hover overlay for the element
            const rect = element.getBoundingClientRect();
            const overlay = document.createElement('div');
            overlay.className = 'cleverfiller-hover-overlay-remove';
            // Hover overlay styles for removing elements
            overlay.style.position = 'absolute';
            overlay.style.top = `${rect.top + window.scrollY - 5}px`;
            overlay.style.left = `${rect.left - 5}px`;
            overlay.style.width = `${rect.width + 10}px`;
            overlay.style.height = `${rect.height + 10}px`;
            overlay.style.zIndex = '999';
            overlay.style.backgroundColor = 'rgba(244, 67, 54, 0.1)';
            overlay.style.cursor = 'pointer';
            overlay.style.border = '2px dashed transparent';
            overlay.style.boxSizing = 'border-box';
            // Hover overlay event listeners for removing elements
            overlay.addEventListener('mouseover', () => {
                overlay.style.border = '2px dashed #f44336';
                overlay.style.backgroundColor = 'rgba(244, 67, 54, 0.2)';
                overlay.innerHTML = '<div style="background: rgba(244, 67, 54, 0.8); color: white; font-size: 12px; padding: 4px; border-radius: 3px; position: absolute; top: 0; right: 0;">Remove</div>';
            });
            overlay.addEventListener('mouseout', () => {
                overlay.style.border = '2px dashed transparent';
                overlay.style.backgroundColor = 'rgba(244, 67, 54, 0.1)';
                overlay.innerHTML = '';
            });
            overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                overlay.remove();
                remove_enlist_element(element);
            });
            document.body.appendChild(overlay);
            continue;
        }
        // Create a hover overlay for the element
        const rect = element.getBoundingClientRect();
        const overlay = document.createElement('div');
        overlay.className = 'cleverfiller-hover-overlay-add';
        // Hover overlay styles for selecting elements
        overlay.style.position = 'absolute';
        overlay.style.top = `${rect.top + window.scrollY - 5}px`;
        overlay.style.left = `${rect.left - 5}px`;
        overlay.style.width = `${rect.width + 10}px`;
        overlay.style.height = `${rect.height + 10}px`;
        overlay.style.zIndex = '999';
        overlay.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
        overlay.style.cursor = 'pointer';
        overlay.style.border = '2px dashed transparent';
        overlay.style.boxSizing = 'border-box';
        // Hover overlay event listeners for selecting elements
        overlay.addEventListener('mouseover', () => {
            overlay.style.border = '2px dashed #4a90e2';
            overlay.style.backgroundColor = 'rgba(74, 144, 226, 0.2)';
            overlay.innerHTML = '<div style="background: rgba(74, 144, 226, 0.8); color: white; font-size: 12px; padding: 4px; border-radius: 3px; position: absolute; top: 0; right: 0;">Select</div>';
        });
        overlay.addEventListener('mouseout', () => {
            overlay.style.border = '2px dashed transparent';
            overlay.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
            overlay.innerHTML = '';
        });
        overlay.addEventListener('click', (e) => {
            e.stopPropagation();
            overlay.remove();
            enlist_element(element);
        });
        document.body.appendChild(overlay);
    }
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
// ----------------------------------------------------------
// Core Functionality
// ----------------------------------------------------------
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
    var _a, _b, _c, _d;
    // Get the label text of the element
    const label_text = element.closest('div') ? ((_b = (_a = element.closest('div')) === null || _a === void 0 ? void 0 : _a.querySelector('label')) === null || _b === void 0 ? void 0 : _b.textContent) || '' : ''; // Get the parent <div> element
    const placeholder_text = element.placeholder || ''; // Get the placeholder text
    const table_label = element.closest('tr') ? ((_d = (_c = element.closest('tr')) === null || _c === void 0 ? void 0 : _c.querySelector('tr')) === null || _d === void 0 ? void 0 : _d.textContent) || '' : ''; // Get the parent <tr> element
    const label = label_text || placeholder_text || table_label; // Use the label text or placeholder text if available
    return label; // Return the label text
}
// Get all attributes from HTML element and return them as an object
function get_element_attributes(element) {
    const attributes = element.attributes;
    const attributeValues = {};
    for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];
        attributeValues[attr.name] = attr.value;
    }
    return attributeValues; // Return the attribute values as an object
}
function filter_redundant_attributes(element) {
    let attributeValues = get_element_attributes(element);
    // Define the attributes to be excluded
    const excludeAttributes = [
        'style',
        'class',
        'value',
        'tabindex',
        'disabled',
        'readonly',
        'autocomplete',
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
    // Exclude all attributes that start with 'data-'
    Object.keys(attributeValues).forEach(key => {
        if (key.startsWith('data-')) {
            delete attributeValues[key];
        }
    });
    return attributeValues; // Return the attribute values as an object
}
function create_element_signature(element) {
    // Create a unique signature for the element to prevent duplicates
    const url = get_window_url();
    const labelText = get_label_text(element);
    const attributeValues = filter_redundant_attributes(element);
    return `${url}|${labelText}|${JSON.stringify(attributeValues)}`;
}
function check_if_element_exists_in_enlist_array(element) {
    // Check if the element already exists in the EnlistArray
    const elementSignature = create_element_signature(element);
    return EnlistArray.some(item => {
        const itemSignature = `${item.url}|${item.labelText}|${JSON.stringify(item.attributeValues)}`;
        return itemSignature === elementSignature;
    });
}
// Store the element to the EnlistArray(disk-cache) and ElementCache(runtime-cache)
function enlist_element(element) {
    const extracted_enlist_data = extract_data_for_enlist_storage(element);
    const alreadyExists = check_if_element_exists_in_enlist_array(element);
    if (!alreadyExists) {
        EnlistArray.push(extracted_enlist_data);
        ElementCache.push(element);
        GM_setValue('enlist', EnlistArray);
    }
}
function remove_enlist_element(element) {
    // Remove the element from the EnlistArray and ElementCache
    const extracted_enlist_data = extract_data_for_enlist_storage(element);
    const elementSignature = `${extracted_enlist_data.url}|${extracted_enlist_data.labelText}|${JSON.stringify(extracted_enlist_data.attributeValues)}`;
    const index = EnlistArray.findIndex(item => {
        const itemSignature = `${item.url}|${item.labelText}|${JSON.stringify(item.attributeValues)}`;
        return itemSignature === elementSignature;
    });
    if (index !== -1) {
        EnlistArray.splice(index, 1); // Remove from EnlistArray
        ElementCache.splice(index, 1); // Remove from ElementCache
        GM_setValue('enlist', EnlistArray); // Update the storage
    }
}
// Extract data to create the enlist object
function extract_data_for_enlist_storage(element) {
    const url = get_window_url();
    const labelText = get_label_text(element);
    const attributeValues = filter_redundant_attributes(element);
    const data = {
        url: url,
        labelText: labelText,
        attributeValues: attributeValues
    };
    return data;
}
// -----------------------------------------------------
// Main function to create the UI
// 2025-04-11 @ 11:28:50: Extracted the HTML to a separate file for better maintainability.
function createUI() {
    // Create the container div and set its properties
    const container = document.createElement('div');
    const container_html = GM_getResourceText('index');
    container.innerHTML = container_html;
    document.body.appendChild(container);
    const cleverfiller_container = container.querySelector('#cleverfiller-container');
    // Initially show or hide the container
    cleverfiller_container.style.display = 'block';
    // Get the app name and version from the script metadata
    const heading = container.querySelector('#cf-app-name');
    heading.textContent = `${get_app_info().name}`;
    const version = container.querySelector('#cf-version-info');
    version.textContent = `version: ${get_app_info().version}`;
    // Get the settings from GM_value and set them in the input fields
    const api_input = container.querySelector('#cf-api-input');
    api_input.value = GM_getValue('api', '');
    const model_option = container.querySelector('#cf-model-select');
    model_option.value = GM_getValue('model', 'deepseek-chat');
    const context_input = container.querySelector('#cf-context-textarea');
    context_input.value = GM_getValue('context', '');
    // Set the default loading text
    const loadingText = cleverfiller_container.querySelector('#cf-console-log');
    loadingText.textContent = 'Press Alt + S to show panel';
    // Short-cut key to show the panel
    function activate_clever_filler_display(event) {
        if (event.altKey && (event.key.toLowerCase() === 's')) {
            event.preventDefault();
            cleverfiller_container.style.display = 'block';
        }
    }
    document.addEventListener('keydown', activate_clever_filler_display);
    // Add event listeners to the buttons
    const hide_button = cleverfiller_container.querySelector('#cf-hide-button');
    const enlist_button = cleverfiller_container.querySelector('#cf-enlist-button');
    const submit_button = cleverfiller_container.querySelector('#cf-submit-button');
    const run_button = cleverfiller_container.querySelector('#cf-run-button');
    setTimeout(() => {
        // Hide button: header button to hide the panel
        hide_button.addEventListener('click', () => {
            cleverfiller_container.style.display = 'none';
        });
        // Enlist button: Main logic to enlist elements
        enlist_button.addEventListener('click', () => {
            // First: get all fillable elements
            const inputtable_elements = scan_form_elements();
            // Then: highlight them
            highlight_form_elements(inputtable_elements);
            // Finally: Create hover overlay for each element
            hover_overlay_handler(inputtable_elements);
        });
        // Save button: save the settings to GM_value
        submit_button.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
            // Initialize loading state
            const loadingText = cleverfiller_container.querySelector('#cf-console-log');
            loadingText.textContent = 'Saving...';
            loadingText.style.color = '#4a90e2'; // Blue color for loading
            submit_button.disabled = true;
            // Save the settings with a delay to show the loading state
            setTimeout(() => {
                // Save the settings
                GM_setValue('api', api_input.value);
                GM_setValue('model', model_option.value);
                GM_setValue('context', context_input.value);
                // Show success state
                loadingText.style.color = '#4CAF50'; // Green color for success
                loadingText.textContent = 'Saved';
                // Clear the message after 1 seconds
                setTimeout(() => {
                    loadingText.textContent = ''; // Clear text
                    submit_button.disabled = false;
                }, 1000);
            }, 1000); // Short delay to make the animation visible
        }));
        // Run button: AI logic to fill the form fields
        run_button.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
            const loadingText = cleverfiller_container.querySelector('#cf-console-log');
            loadingText.textContent = 'Loading...';
            loadingText.style.color = '#4a90e2'; // Blue color for loading
            // Disable the button while processing
            run_button.disabled = true;
            // Validate settings
            if (api_input.value === '' || context_input.value === '') {
                // Show error message if API or context is empty
                loadingText.textContent = 'Incorrect API or empty context';
                loadingText.style.color = '#f44336'; // Red color for error
                // Clear the message after 2 seconds
                setTimeout(() => {
                    loadingText.textContent = '';
                    run_button.disabled = false;
                }, 2000);
                return;
            }
            // Check if elements are available in the ElementCache
            if (ElementCache.length === 0) {
                loadingText.textContent = 'No form elements selected.';
                loadingText.style.color = '#ff9800'; // Warning color
                setTimeout(() => {
                    loadingText.textContent = '';
                    run_button.disabled = false;
                }, 2000);
                return;
            }
            // Show loading message with the number of fields to be filled
            loadingText.textContent = `Preparing to fill ${ElementCache.length} form fields...`;
            loadingText.style.color = '#4a90e2'; // Blue color for loading
            // Short delay so user can see the initial count
            yield new Promise(resolve => setTimeout(resolve, 800));
            try {
                // Process each field with AI
                for (let i = 0; i < ElementCache.length; i++) {
                    // Use ElementCache to process DOM
                    // Use EnlistArray to get element attributes that are better for AI model to process.
                    // The fillable elements should be consistent with both arrays.
                    const cached_element = ElementCache[i];
                    const enlisted_element_attr = EnlistArray[i].attributeValues;
                    // Change the style of the element to indicate processing
                    cached_element.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
                    cached_element.style.border = '2px solid #4a90e2';
                    // Update loading text with current status
                    loadingText.textContent = `Processing field ${i + 1}/${ElementCache.length}...`;
                    try {
                        // Create a prompt: context_input contains the context information, and enlisted_element contains the field information.
                        const prompt = create_prompt(context_input.value, enlisted_element_attr);
                        // Show specific field information
                        if (enlisted_element_attr.labelText) {
                            loadingText.textContent = `Processing ${enlisted_element_attr.labelText} (${i + 1}/${ElementCache.length})...`;
                        }
                        // Call the DeepSeek API with the prompt
                        const response = yield call_deepseek_api(prompt);
                        // Get the string value from the response that contains only the value of the field.
                        const fieldValue = parse_ai_response(response);
                        console.log('[CleverFiller] Field Value:', fieldValue);
                        // TODO: Support more types of elements and stream the response to the element.
                        fill_form(cached_element, fieldValue);
                    }
                    catch (error) {
                        console.error('Error processing field:', error);
                        loadingText.textContent = `Error processing field ${i + 1}/${ElementCache.length}`;
                        loadingText.style.color = '#f44336'; // Red color for error
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
