// ==UserScript==
// @name         CleverFiller
// @namespace    https://github.com/joolowweng/cleverfiller
// @version      2.3.0
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
// @resource     index file:///C:/Users/Yikai/.github/cleverfiller/html/dashboard.html
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
const default_cache = {
    enlist: [],
    preload: [],
    afterload: []
};
// EnlistArray: Array to store enlisted elements
const EnlistArray = GM_getValue(get_window_url(), default_cache).enlist || [];
// ElementCache: Array to store the fillable elements that are currently in the DOM
const PreloadArray = GM_getValue(get_window_url(), default_cache).preload || [];
const AfterloadArray = GM_getValue(get_window_url(), default_cache).afterload || [];
const EnlistCache = [];
const PreloadCache = [];
const AfterloadCache = [];
// General Utility Functions
// -----------------------------------------------------------
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
// -----------------------------------------------------------
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
// -----------------------------------------------------------
// DOM Manipulation Functions
// -----------------------------------------------------------
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
function create_hover_overlays(elements, cacheArray, dataArray, addCallback, removeCallback, addColor, removeColor, addLabel, removeLabel) {
    // Clear existing overlays if any
    const existingOverlays = document.querySelectorAll('.cleverfiller-hover-overlay-add, .cleverfiller-hover-overlay-remove');
    existingOverlays.forEach(overlay => overlay.remove());
    // Create a Map for quick lookup
    const dataMap = new Map();
    dataArray.forEach(data => {
        const signature = create_element_signature(data);
        dataMap.set(signature, data);
    });
    for (const element of Array.from(elements)) {
        const elementSignature = create_element_signature(element);
        const isAlreadyEnlisted = dataMap.has(elementSignature);
        if (isAlreadyEnlisted) {
            cacheArray.push(element); // Add to cache
        }
        // Create hover overlay
        const rect = element.getBoundingClientRect();
        const overlay = document.createElement('div');
        overlay.className = isAlreadyEnlisted ? 'cleverfiller-hover-overlay-remove' : 'cleverfiller-hover-overlay-add';
        // Common styles
        overlay.style.position = 'absolute';
        overlay.style.top = `${rect.top + window.scrollY - 5}px`;
        overlay.style.left = `${rect.left - 5}px`;
        overlay.style.width = `${rect.width + 10}px`;
        overlay.style.height = `${rect.height + 10}px`;
        overlay.style.zIndex = '999';
        overlay.style.cursor = 'pointer';
        overlay.style.border = '2px dashed transparent';
        overlay.style.boxSizing = 'border-box';
        if (isAlreadyEnlisted) {
            // Styles for removing elements
            overlay.style.backgroundColor = removeColor;
            overlay.addEventListener('mouseover', () => {
                overlay.style.border = `2px dashed ${removeColor}`;
                overlay.style.backgroundColor = `${removeColor.replace('0.1', '0.2')}`;
                overlay.innerHTML = `<div style="background: ${removeColor.replace('0.1', '0.8')}; color: white; font-size: 12px; padding: 4px; border-radius: 3px; position: absolute; top: 0; right: 0;">${removeLabel}</div>`;
            });
            overlay.addEventListener('mouseout', () => {
                overlay.style.border = '2px dashed transparent';
                overlay.style.backgroundColor = removeColor;
                overlay.innerHTML = '';
            });
            overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                overlay.remove();
                removeCallback(element);
                create_hover_overlays(elements, cacheArray, dataArray, addCallback, removeCallback, addColor, removeColor, addLabel, removeLabel);
            });
        }
        else {
            // Styles for adding elements
            overlay.style.backgroundColor = addColor;
            overlay.addEventListener('mouseover', () => {
                overlay.style.border = `2px dashed ${addColor}`;
                overlay.style.backgroundColor = `${addColor.replace('0.1', '0.2')}`;
                overlay.innerHTML = `<div style="background: ${addColor.replace('0.1', '0.8')}; color: white; font-size: 12px; padding: 4px; border-radius: 3px; position: absolute; top: 0; right: 0;">${addLabel}</div>`;
            });
            overlay.addEventListener('mouseout', () => {
                overlay.style.border = '2px dashed transparent';
                overlay.style.backgroundColor = addColor;
                overlay.innerHTML = '';
            });
            overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                overlay.remove();
                addCallback(element);
                create_hover_overlays(elements, cacheArray, dataArray, addCallback, removeCallback, addColor, removeColor, addLabel, removeLabel);
            });
        }
        document.body.appendChild(overlay);
    }
}
function hover_overlay_handler_for_enlist_button(elements) {
    create_hover_overlays(elements, EnlistCache, EnlistArray, enlist_element, remove_enlist_element, 'rgba(74, 144, 226, 0.1)', // Add color
    'rgba(244, 67, 54, 0.1)', // Remove color
    'Select', // Add label
    'Remove' // Remove label
    );
}
function hover_overlay_handler_for_load_button(elements, loader_method) {
    if (loader_method === 'preload') {
        create_hover_overlays(elements, PreloadCache, PreloadArray, (element) => {
            const data = extract_data_for_enlist_storage(element);
            PreloadArray.push(data);
            PreloadCache.push(element);
            GM_setValue(get_window_url(), Object.assign(Object.assign({}, GM_getValue(get_window_url(), default_cache)), { preload: PreloadArray }));
        }, remove_preload_element, 'rgba(74, 144, 226, 0.1)', // Add color
        'rgba(244, 67, 54, 0.1)', // Remove color
        'Add to Preload', // Add label
        'Remove' // Remove label
        );
    }
    else if (loader_method === 'afterload') {
        create_hover_overlays(elements, AfterloadCache, AfterloadArray, (element) => {
            const data = extract_data_for_enlist_storage(element);
            AfterloadArray.push(data);
            AfterloadCache.push(element);
            GM_setValue(get_window_url(), Object.assign(Object.assign({}, GM_getValue(get_window_url(), default_cache)), { afterload: AfterloadArray }));
        }, remove_afterload_element, 'rgba(74, 144, 226, 0.1)', // Add color
        'rgba(244, 67, 54, 0.1)', // Remove color
        'Add to Afterload', // Add label
        'Remove' // Remove label
        );
    }
}
function fill_form(element, value) {
    // Fill the form element with the value
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = value;
        // Trigger events to ensure the framework detects the change
        setTimeout(() => {
            // Create and dispatch events that most frameworks listen for
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`[CleverFiller] Field filled with value: "${value}"`);
        }, 100);
    }
    else if (element.tagName === 'SELECT') {
        const selectElement = element;
        const optionToSelect = Array.from(selectElement.options).find(option => option.value === value);
        if (optionToSelect) {
            selectElement.value = optionToSelect.value;
            // Trigger change event for select elements
            setTimeout(() => {
                element.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`[CleverFiller] Select option set to: "${optionToSelect.value}"`);
            }, 100);
        }
    }
    // Reset any special styling applied during processing
    setTimeout(() => {
        element.style.backgroundColor = '';
        element.style.border = '';
    }, 500);
}
// -----------------------------------------------------------
// Core Functionality
// -----------------------------------------------------------
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
        if (key.startsWith('aria-')) {
            delete attributeValues[key];
        }
    });
    return attributeValues; // Return the attribute values as an object
}
function create_element_signature(element) {
    // Create a unique signature for the element to prevent duplicates
    if (element && element instanceof HTMLElement) {
        const labelText = get_label_text(element);
        const attributeValues = filter_redundant_attributes(element);
        return `${labelText}|${JSON.stringify(attributeValues)}`;
    }
    if (element && typeof element === 'object') {
        return `${element.labelText}|${JSON.stringify(element.attributeValues)}`;
    }
    // Default case - return an empty string as fallback
    return '';
}
function check_if_element_exists_in_enlist_array(element) {
    // Check if the element already exists in the EnlistArray
    const elementSignature = create_element_signature(element);
    return EnlistArray.some(item => {
        const itemSignature = create_element_signature(item);
        return itemSignature === elementSignature;
    });
}
// Store the element to the EnlistArray(disk-cache) and ElementCache(runtime-cache)
function enlist_element(element) {
    const extracted_enlist_data = extract_data_for_enlist_storage(element);
    const alreadyExists = check_if_element_exists_in_enlist_array(element);
    if (!alreadyExists) {
        EnlistArray.push(extracted_enlist_data);
        EnlistCache.push(element);
        const currentData = GM_getValue(get_window_url(), default_cache);
        GM_setValue(get_window_url(), {
            enlist: EnlistArray,
            preload: currentData.preload || [],
            afterload: currentData.afterload || []
        });
        update_enlist_count();
    }
}
function remove_enlist_element(element) {
    // Remove the element from the EnlistArray and ElementCache
    const elementSignature = create_element_signature(element);
    const index = EnlistArray.findIndex(item => {
        const itemSignature = create_element_signature(item);
        return itemSignature === elementSignature;
    });
    if (index !== -1) {
        EnlistArray.splice(index, 1); // Remove from EnlistArray
        EnlistCache.splice(index, 1); // Remove from ElementCache
        const currentData = GM_getValue(get_window_url(), default_cache);
        GM_setValue(get_window_url(), {
            enlist: EnlistArray,
            preload: currentData.preload || [],
            afterload: currentData.afterload || []
        });
        update_enlist_count(); // Update the enlist count badge
    }
}
function remove_preload_element(element) {
    const elementSignature = create_element_signature(element);
    const index = PreloadArray.findIndex(item => {
        const itemSignature = create_element_signature(item);
        return itemSignature === elementSignature;
    });
    if (index !== -1) {
        PreloadArray.splice(index, 1); // Remove from PreloadArray
        PreloadCache.splice(index, 1); // Remove from PreloadCache
        const currentData = GM_getValue(get_window_url(), default_cache);
        GM_setValue(get_window_url(), {
            enlist: currentData.enlist || [],
            preload: PreloadArray,
            afterload: currentData.afterload || []
        });
    }
}
function remove_afterload_element(element) {
    const elementSignature = create_element_signature(element);
    const index = AfterloadArray.findIndex(item => {
        const itemSignature = create_element_signature(item);
        return itemSignature === elementSignature;
    });
    if (index !== -1) {
        AfterloadArray.splice(index, 1); // Remove from AfterloadArray
        AfterloadCache.splice(index, 1); // Remove from AfterloadCache
        const currentData = GM_getValue(get_window_url(), default_cache);
        GM_setValue(get_window_url(), {
            enlist: currentData.enlist || [],
            preload: currentData.preload || [],
            afterload: AfterloadArray
        });
    }
}
// Extract data to create the enlist object
function extract_data_for_enlist_storage(element) {
    const labelText = get_label_text(element);
    const attributeValues = filter_redundant_attributes(element);
    const data = {
        labelText: labelText,
        attributeValues: attributeValues
    };
    return data;
}
// 添加到 createUI 函数中
function setupTabNavigation(container) {
    const tabs = container.querySelectorAll('.cf-nav-tab');
    const tabContentContainer = container.querySelector('#cleverfiller-inner-body');
    if (!tabContentContainer) {
        console.error('Tab content container not found');
        return;
    }
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 移除所有活动标签类
            tabs.forEach(t => t.classList.remove('active'));
            // 添加活动类到当前标签
            tab.classList.add('active');
            // 获取目标标签内容ID
            const tabName = tab.dataset.tab;
            const targetId = `cf-tab-${tabName}`;
            // 记录调试信息
            console.log(`Switching to tab: ${tabName}, looking for ID: ${targetId}`);
            // 隐藏所有内容 (限定在内容容器内查询)
            const contents = tabContentContainer.querySelectorAll('.cf-tab-content');
            contents.forEach(content => {
                content.classList.remove('active');
                console.log(`Removed active from: ${content.id}`);
            });
            // 显示对应内容 (限定在内容容器内查询)
            const targetContent = tabContentContainer.querySelector(`#${targetId}`);
            if (targetContent) {
                targetContent.classList.add('active');
                console.log(`Added active to: ${targetId}`);
            }
            else {
                console.error(`Tab content element not found: #${targetId}`);
            }
        });
    });
}
function update_enlist_count() {
    const countBadge = document.querySelector('#cf-enlist-count');
    if (countBadge) {
        if (EnlistArray.length === 0) {
            countBadge.style.display = 'none'; // Hide the badge if no elements are enlisted
        }
        else {
            countBadge.style.display = 'flex';
            countBadge.textContent = EnlistArray.length.toString();
        }
    }
}
function setup_auto_save(container) {
    const api_input = container.querySelector('#cf-api-input');
    const model_option = container.querySelector('#cf-model-select');
    const context_input = container.querySelector('#cf-context-textarea');
    const workflow_mode = container.querySelector('#cf-workflow-mode');
    const initial_display = container.querySelector('#cf-initial-display');
    const save_value = (key, value) => {
        GM_setValue(key, value);
    };
    api_input.addEventListener('input', () => save_value('api', api_input.value));
    model_option.addEventListener('change', () => save_value('model', model_option.value));
    context_input.addEventListener('input', () => save_value('context', context_input.value));
    workflow_mode.addEventListener('change', () => save_value('workflow_mode', workflow_mode.checked));
    initial_display.addEventListener('change', () => save_value('initial_display', initial_display.checked));
}
// 2025-04-11 @ 11:28:50: Extracted the HTML to a separate file for better maintainability.
function createUI() {
    // Create the container div and set its properties
    const container = document.createElement('div');
    const container_html = GM_getResourceText('index');
    container.innerHTML = container_html;
    document.body.appendChild(container);
    const cleverfiller_container = container.querySelector('#cleverfiller-container');
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
    const workflow_mode = container.querySelector('#cf-workflow-mode');
    workflow_mode.checked = GM_getValue('workflow_mode', false);
    const initial_display = container.querySelector('#cf-initial-display');
    initial_display.checked = GM_getValue('initial_display', false);
    // Initially show or hide the container
    if (initial_display.checked) {
        cleverfiller_container.style.display = 'block';
    }
    else {
        cleverfiller_container.style.display = 'none';
    }
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
    add_dropdown_button_listener(cleverfiller_container); // Add event listener to the dropdown button
    const hide_button = cleverfiller_container.querySelector('#cf-hide-button');
    const enlist_button = cleverfiller_container.querySelector('#cf-enlist-button');
    const run_button = cleverfiller_container.querySelector('#cf-run-button');
    const reset_button = cleverfiller_container.querySelector('#cf-reset-button');
    add_hide_button_listener(hide_button, cleverfiller_container);
    add_enlist_button_listener(enlist_button, cleverfiller_container);
    add_reset_button_listener(reset_button, cleverfiller_container);
    add_run_button_listener(run_button, cleverfiller_container);
    setTimeout(() => {
        // Set up auto-save functionality
        setup_auto_save(cleverfiller_container);
        update_enlist_count();
    }, 500);
    setupTabNavigation(cleverfiller_container);
}
function add_dropdown_button_listener(cleverfiller_container) {
    const dropdown_button = cleverfiller_container.querySelector('#cf-load-button');
    const dropdown_container = cleverfiller_container.querySelector('.cf-dropdown-container');
    const preload_button = cleverfiller_container.querySelector('#cf-preload-button');
    const afterload_button = cleverfiller_container.querySelector('#cf-afterload-button');
    dropdown_button === null || dropdown_button === void 0 ? void 0 : dropdown_button.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown_container) {
            dropdown_container.classList.toggle('active');
        }
    });
    document.addEventListener('click', (event) => {
        if (dropdown_container && !dropdown_container.contains(event.target)) {
            dropdown_container.classList.remove('active');
        }
    });
    preload_button === null || preload_button === void 0 ? void 0 : preload_button.addEventListener('click', () => {
        hover_overlay_handler_for_load_button(scan_form_elements(), 'preload');
    });
    afterload_button === null || afterload_button === void 0 ? void 0 : afterload_button.addEventListener('click', () => {
        hover_overlay_handler_for_load_button(scan_form_elements(), 'afterload');
    });
}
function add_hide_button_listener(hide_button, container) {
    hide_button.addEventListener('click', () => {
        container.style.display = 'none';
    });
}
function add_enlist_button_listener(enlist_button, container) {
    enlist_button.addEventListener('click', () => {
        const inputtable_elements = scan_form_elements();
        highlight_form_elements(inputtable_elements);
        hover_overlay_handler_for_enlist_button(inputtable_elements);
        update_enlist_count();
    });
}
function add_reset_button_listener(reset_button, container) {
    reset_button.addEventListener('click', () => {
        const loadingText = container.querySelector('#cf-console-log');
        loadingText.textContent = 'Reset the elements...';
        setTimeout(() => {
            EnlistArray.length = 0;
            EnlistCache.length = 0;
            GM_setValue(get_window_url(), { enlist: EnlistArray });
            window.location.reload();
            loadingText.textContent = 'Reset successfully!';
            loadingText.style.color = '#4CAF50'; // Green color for success
            setTimeout(() => {
                loadingText.textContent = ''; // Clear text
            }, 1000);
        }, 1000);
    });
}
function add_run_button_listener(run_button, container) {
    run_button.addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
        const loadingText = container.querySelector('#cf-console-log');
        const api_input = container.querySelector('#cf-api-input');
        const context_input = container.querySelector('#cf-context-textarea');
        loadingText.textContent = 'Loading...';
        loadingText.style.color = '#4a90e2'; // Blue color for loading
        run_button.disabled = true;
        if (api_input.value === '' || context_input.value === '') {
            loadingText.textContent = 'Incorrect API or empty context';
            loadingText.style.color = '#f44336'; // Red color for error
            setTimeout(() => {
                loadingText.textContent = '';
                run_button.disabled = false;
            }, 2000);
            return;
        }
        EnlistCache.length = 0;
        hover_overlay_handler_for_enlist_button(scan_form_elements());
        if (EnlistCache.length === 0) {
            loadingText.textContent = 'No form elements selected.';
            loadingText.style.color = '#ff9800'; // Warning color
            setTimeout(() => {
                loadingText.textContent = '';
                run_button.disabled = false;
            }, 2000);
            return;
        }
        const existingOverlays = document.querySelectorAll('.cleverfiller-hover-overlay-add, .cleverfiller-hover-overlay-remove, .cleverfiller-hover-overlay-preload');
        existingOverlays.forEach(overlay => overlay.remove());
        loadingText.textContent = `Preparing to fill ${EnlistCache.length} form fields...`;
        loadingText.style.color = '#4a90e2';
        yield new Promise(resolve => setTimeout(resolve, 800));
        try {
            if (PreloadCache.length > 0) {
                loadingText.textContent = `Executing ${PreloadCache.length} pre-fill actions...`;
                for (let i = 0; i < PreloadCache.length; i++) {
                    const element = PreloadCache[i];
                    loadingText.textContent = `Executing pre-fill action ${i + 1}/${PreloadCache.length}...`;
                    element.click();
                    yield new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            for (let i = 0; i < EnlistCache.length; i++) {
                const cached_element = EnlistCache[i];
                const enlisted_element_attr = EnlistArray[i].attributeValues;
                cached_element.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
                cached_element.style.border = '2px solid #4a90e2';
                loadingText.textContent = `Processing field ${i + 1}/${EnlistCache.length}...`;
                try {
                    const prompt = create_prompt(context_input.value, enlisted_element_attr);
                    if (enlisted_element_attr.labelText) {
                        loadingText.textContent = `Processing ${enlisted_element_attr.labelText} (${i + 1}/${EnlistCache.length})...`;
                    }
                    const response = yield call_deepseek_api(prompt);
                    const fieldValue = parse_ai_response(response);
                    console.log('[CleverFiller] Field Value:', fieldValue);
                    fill_form(cached_element, fieldValue);
                }
                catch (error) {
                    console.error('Error processing field:', error);
                    loadingText.textContent = `Error processing field ${i + 1}/${EnlistCache.length}`;
                    loadingText.style.color = '#f44336';
                }
            }
        }
        catch (error) {
            console.error('Error filling form:', error);
            loadingText.textContent = 'Check the console for errors.';
            loadingText.style.color = '#f44336';
        }
        finally {
            setTimeout(() => {
                run_button.disabled = false;
                loadingText.textContent = '';
            }, 1000);
        }
    }));
}
createUI();
