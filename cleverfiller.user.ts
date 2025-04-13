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
interface current_url_cache {
    [key: string]: Array<Record<string, any>>;
    enlist: []
    preload: []
    afterload: []
}
const default_cache: current_url_cache = {
    enlist: [],
    preload: [],
    afterload: []
};

// EnlistArray: Array to store enlisted elements
const EnlistArray: Array<Record<string, any>> = GM_getValue(get_window_url(), default_cache).enlist || [];
// ElementCache: Array to store the fillable elements that are currently in the DOM
const PreloadArray: Array<Record<string, any>> = GM_getValue(get_window_url(), default_cache).preload || [];
const AfterloadArray: Array<Record<string, any>> = GM_getValue(get_window_url(), default_cache).afterload || [];

const EnlistCache: HTMLElement[] = [];
const PreloadCache: HTMLElement[] = [];
const AfterloadCache: HTMLElement[] = [];

// General Utility Functions
// -----------------------------------------------------------
function get_app_info(): { name: string; version: string } {

    const script = GM_info.script;
    const name = script.name;
    const version = script.version;
    return { name, version };
}

function get_window_url(): string {
    const url = window.location.href; // Get the current URL of the window
    return url; // Return the URL
}
// -----------------------------------------------------------

// AI Part
// -----------------------------------------------------------
async function get_response<T>(options: Tampermonkey.Request<any>, on_start?: () => void): Promise<T | string> {
    // April 9 2025 - Added a callback function to be executed when the request starts.
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            ...options,
            onloadstart: function () {
                if (on_start) {
                    on_start();
                }
            },
            onload: (response) => {
                console.log('[CleverFiller] Response Status:', response.status);
                if (response.status === 200) {
                    try {
                        resolve(JSON.parse(response.responseText) as T); // Resolve with the parsed response
                    } catch (error) {
                        console.error('[CleverFiller] Failed to parse response:', error);
                        reject(new Error(`${error}`));
                    }
                } else {
                    console.error('[CleverFiller] HTTP Error:', response.status);
                    reject(new Error(`${response.status}`)); // Resolve with null in case of error
                }
            },
            onerror: (error) => {
                console.error('[CleverFiller] Request failed:', error);
                reject(new Error(`${error}`)); // Resolve with null in case of error
            }
        });
    });
}

async function call_deepseek_api<T>(prompt: string): Promise<T> {
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
        return await get_response({
            method: method,
            url: url,
            headers: headers,
            data: JSON.stringify(data),
        }) as Promise<T>; // Cast the response to the expected type
    } catch (error) {
        console.error('[CleverFiller] Error calling DeepSeek API:', error);
        throw error;
    }
}

// 2025-04-11 @ 21:16:35: Changed the prompt and improved the parsing logic.
function create_prompt(context: string, formData: Array<Record<string, unknown>>): string {
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

function parse_ai_response(response: any): string {
    try {
        const msg_content = response?.choices?.[0]?.message?.content;
        if (!msg_content) {
            throw new Error('Invalid API response format')
        }
        return msg_content.trim();
    } catch (error) {
        console.error('Failed to parse API response:', error);
        return '';
    }
}
// -----------------------------------------------------------

// DOM Manipulation Functions
// -----------------------------------------------------------
// 2025.04.11: Tweaked style of highlighted elements.
function highlight_form_elements(elements: NodeListOf<HTMLInputElement>): void {

    for (const element of Array.from(elements)) {
        element.style = `
        background-color: #e0f7fa;
        border: 2px solid #4a90e2;
        border-radius: 4px;
        transition: all 0.3s ease;
        `;
    }
}

function create_hover_overlays(
    elements: NodeListOf<HTMLInputElement>,
    cacheArray: HTMLElement[],
    dataArray: Array<Record<string, any>>,
    addCallback: (element: HTMLElement) => void,
    removeCallback: (element: HTMLElement) => void,
    addColor: string,
    removeColor: string,
    addLabel: string,
    removeLabel: string
): void {
    // Clear existing overlays if any
    const existingOverlays = document.querySelectorAll('.cleverfiller-hover-overlay-add, .cleverfiller-hover-overlay-remove');
    existingOverlays.forEach(overlay => overlay.remove());

    // Create a Map for quick lookup
    const dataMap = new Map<string, Record<string, any>>();
    dataArray.forEach(data => {
        const signature = create_element_signature(data);
        dataMap.set(signature, data);
    });

    for (const element of Array.from(elements)) {
        const elementSignature = create_element_signature(element as HTMLElement);
        const isAlreadyEnlisted = dataMap.has(elementSignature);

        if (isAlreadyEnlisted) {
            cacheArray.push(element); // Add to cache
        }

        // Create hover overlay
        const rect: DOMRect = element.getBoundingClientRect();
        const overlay: HTMLDivElement = document.createElement('div');
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
            overlay.addEventListener('click', (e: MouseEvent) => {
                e.stopPropagation();
                overlay.remove();
                removeCallback(element);

                create_hover_overlays(
                    elements,
                    cacheArray,
                    dataArray,
                    addCallback,
                    removeCallback,
                    addColor,
                    removeColor,
                    addLabel,
                    removeLabel
                );
            });
        } else {
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
            overlay.addEventListener('click', (e: MouseEvent) => {
                e.stopPropagation();
                overlay.remove();
                addCallback(element);

                create_hover_overlays(
                    elements,
                    cacheArray,
                    dataArray,
                    addCallback,
                    removeCallback,
                    addColor,
                    removeColor,
                    addLabel,
                    removeLabel
                );
            });
        }

        document.body.appendChild(overlay);
    }
}

function hover_overlay_handler_for_enlist_button(elements: NodeListOf<HTMLInputElement>): void {
    create_hover_overlays(
        elements,
        EnlistCache,
        EnlistArray,
        enlist_element,
        remove_enlist_element,
        'rgba(74, 144, 226, 0.1)', // Add color
        'rgba(244, 67, 54, 0.1)',  // Remove color
        'Select',                  // Add label
        'Remove'                   // Remove label
    );
}

function hover_overlay_handler_for_load_button(elements: NodeListOf<HTMLInputElement>, loader_method: string): void {
    if (loader_method === 'preload') {
        create_hover_overlays(
            elements,
            PreloadCache,
            PreloadArray,
            (element) => {
                const data = extract_data_for_enlist_storage(element);
                PreloadArray.push(data);
                PreloadCache.push(element);
                GM_setValue(get_window_url(), {
                    ...GM_getValue(get_window_url(), default_cache),
                    preload: PreloadArray
                });
            },
            remove_preload_element,
            'rgba(74, 144, 226, 0.1)', // Add color
            'rgba(244, 67, 54, 0.1)',  // Remove color
            'Add to Preload',          // Add label
            'Remove'                   // Remove label
        );
    } else if (loader_method === 'afterload') {
        create_hover_overlays(
            elements,
            AfterloadCache,
            AfterloadArray,
            (element) => {
                const data = extract_data_for_enlist_storage(element);
                AfterloadArray.push(data);
                AfterloadCache.push(element);
                GM_setValue(get_window_url(), {
                    ...GM_getValue(get_window_url(), default_cache),
                    afterload: AfterloadArray
                });
            },
            remove_afterload_element,
            'rgba(74, 144, 226, 0.1)', // Add color
            'rgba(244, 67, 54, 0.1)',  // Remove color
            'Add to Afterload',        // Add label
            'Remove'                   // Remove label
        );
    }
}

function fill_form(element: HTMLElement, value: string): void {
    // Fill the form element with the value
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        (element as HTMLInputElement).value = value;

        // Trigger events to ensure the framework detects the change
        setTimeout(() => {
            // Create and dispatch events that most frameworks listen for
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`[CleverFiller] Field filled with value: "${value}"`);
        }, 100);

    } else if (element.tagName === 'SELECT') {
        const selectElement = element as HTMLSelectElement;
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
function scan_form_elements(): NodeListOf<HTMLInputElement> {

    const allInputs = document.querySelectorAll<HTMLInputElement>('input, textarea, select');
    // Exclude elements within div[id="cleverfiller-container"]
    const filteredInputs = Array.from(allInputs).filter(input => {
        const parentDiv = input.closest('div#cleverfiller-container');
        return !parentDiv;
    });

    return filteredInputs as unknown as NodeListOf<HTMLInputElement>;
}
// TODO: Improve the logic to find the label text of the element.
function get_label_text(element: HTMLInputElement): string {
    // Get the label text of the element
    const label_text = element.closest('div') ? element.closest('div')?.querySelector('label')?.textContent || '' : '';// Get the parent <div> element
    const placeholder_text = element.placeholder || ''; // Get the placeholder text
    const table_label = element.closest('tr') ? element.closest('tr')?.querySelector('tr')?.textContent || '' : ''; // Get the parent <tr> element
    const label = label_text || placeholder_text || table_label; // Use the label text or placeholder text if available
    return label; // Return the label text
}

// Get all attributes from HTML element and return them as an object
function get_element_attributes(element: HTMLElement): { [key: string]: string } {
    const attributes: NamedNodeMap = element.attributes;
    const attributeValues: { [key: string]: string } = {};
    for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];
        attributeValues[attr.name] = attr.value;
    }
    return attributeValues; // Return the attribute values as an object
}

function filter_redundant_attributes(element: HTMLElement): Record<string, string> {
    let attributeValues = get_element_attributes(element as HTMLElement);
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

function create_element_signature(element: HTMLElement | Record<string, any>): string {
    // Create a unique signature for the element to prevent duplicates
    if (element && element instanceof HTMLElement) {

        const labelText = get_label_text(element as HTMLInputElement);
        const attributeValues = filter_redundant_attributes(element);
        return `${labelText}|${JSON.stringify(attributeValues)}`;
    }
    if (element && typeof element === 'object') {
        return `${element.labelText}|${JSON.stringify(element.attributeValues)}`;
    }
    // Default case - return an empty string as fallback
    return '';
}

function check_if_element_exists_in_enlist_array(element: HTMLElement): boolean {
    // Check if the element already exists in the EnlistArray
    const elementSignature = create_element_signature(element);
    return EnlistArray.some(item => {
        const itemSignature = create_element_signature(item);
        return itemSignature === elementSignature;
    });
}

// Store the element to the EnlistArray(disk-cache) and ElementCache(runtime-cache)
function enlist_element(element: HTMLElement): void {
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

function remove_enlist_element(element: HTMLElement): void {
    // Remove the element from the EnlistArray and ElementCache
    const elementSignature = create_element_signature(element)
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

function remove_preload_element(element: HTMLElement): void {
    const elementSignature = create_element_signature(element)
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

function remove_afterload_element(element: HTMLElement): void {
    const elementSignature = create_element_signature(element)
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
function extract_data_for_enlist_storage(element: HTMLElement): Record<string, any> {
    const labelText = get_label_text(element as HTMLInputElement);
    const attributeValues = filter_redundant_attributes(element);
    const data = {
        labelText: labelText,
        attributeValues: attributeValues
    };
    return data;
}
// -----------------------------------------------------------

// Main function to create the UI
interface TabElement extends HTMLElement {
    dataset: {
        tab: string;
    };
}

// 添加到 createUI 函数中
function setupTabNavigation(container: HTMLDivElement): void {
    const tabs = container.querySelectorAll<TabElement>('.cf-nav-tab');
    const tabContentContainer = container.querySelector<HTMLElement>('#cleverfiller-inner-body');

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
            const contents = tabContentContainer.querySelectorAll<HTMLElement>('.cf-tab-content');
            contents.forEach(content => {
                content.classList.remove('active');
                console.log(`Removed active from: ${content.id}`);
            });

            // 显示对应内容 (限定在内容容器内查询)
            const targetContent = tabContentContainer.querySelector<HTMLElement>(`#${targetId}`);

            if (targetContent) {
                targetContent.classList.add('active');
                console.log(`Added active to: ${targetId}`);
            } else {
                console.error(`Tab content element not found: #${targetId}`);
            }
        });
    });
}

function update_enlist_count(): void {
    const countBadge = document.querySelector<HTMLElement>('#cf-enlist-count');
    if (countBadge) {
        if (EnlistArray.length === 0) {
            countBadge.style.display = 'none'; // Hide the badge if no elements are enlisted
        } else {
            countBadge.style.display = 'flex';
            countBadge.textContent = EnlistArray.length.toString();
        }
    }
}

function setup_auto_save(container: HTMLDivElement): void {
    const api_input = container.querySelector('#cf-api-input') as HTMLInputElement;
    const model_option = container.querySelector('#cf-model-select') as HTMLSelectElement;
    const context_input = container.querySelector('#cf-context-textarea') as HTMLTextAreaElement;
    const workflow_mode = container.querySelector('#cf-workflow-mode') as HTMLInputElement;
    const initial_display = container.querySelector('#cf-initial-display') as HTMLInputElement;

    const save_value = (key: string, value: string | boolean) => {
        GM_setValue(key, value);
    };

    api_input.addEventListener('input', () => save_value('api', api_input.value));
    model_option.addEventListener('change', () => save_value('model', model_option.value));
    context_input.addEventListener('input', () => save_value('context', context_input.value));
    workflow_mode.addEventListener('change', () => save_value('workflow_mode', workflow_mode.checked));
    initial_display.addEventListener('change', () => save_value('initial_display', initial_display.checked));
}

// 2025-04-11 @ 11:28:50: Extracted the HTML to a separate file for better maintainability.
function createUI(): void {
    // Create the container div and set its properties
    const container = document.createElement('div');
    const container_html = GM_getResourceText('index');
    container.innerHTML = container_html;
    document.body.appendChild(container);
    const cleverfiller_container = container.querySelector('#cleverfiller-container') as HTMLDivElement;

    // Get the app name and version from the script metadata
    const heading = container.querySelector('#cf-app-name') as HTMLHeadingElement;
    heading.textContent = `${get_app_info().name}`;
    const version = container.querySelector('#cf-version-info') as HTMLSpanElement;
    version.textContent = `version: ${get_app_info().version}`;

    // Get the settings from GM_value and set them in the input fields
    const api_input = container.querySelector('#cf-api-input') as HTMLInputElement;
    api_input.value = GM_getValue('api', '');
    const model_option = container.querySelector('#cf-model-select') as HTMLSelectElement;
    model_option.value = GM_getValue('model', 'deepseek-chat');
    const context_input = container.querySelector('#cf-context-textarea') as HTMLTextAreaElement;
    context_input.value = GM_getValue('context', '');
    const workflow_mode = container.querySelector('#cf-workflow-mode') as HTMLInputElement;
    workflow_mode.checked = GM_getValue('workflow_mode', false);
    const initial_display = container.querySelector('#cf-initial-display') as HTMLInputElement;
    initial_display.checked = GM_getValue('initial_display', false);

    // Initially show or hide the container

    if (initial_display.checked) {
        cleverfiller_container.style.display = 'block';
    }
    else {
        cleverfiller_container.style.display = 'none';
    }

    // Set the default loading text
    const loadingText = cleverfiller_container.querySelector('#cf-console-log') as HTMLElement;
    loadingText.textContent = 'Press Alt + S to show panel';

    // Short-cut key to show the panel
    function activate_clever_filler_display(event: KeyboardEvent): void {
        if (event.altKey && (event.key.toLowerCase() === 's')) {
            event.preventDefault();
            cleverfiller_container.style.display = 'block';
        }
    }
    document.addEventListener('keydown', activate_clever_filler_display);

    // Add event listeners to the buttons
    add_dropdown_button_listener(cleverfiller_container); // Add event listener to the dropdown button
    const hide_button = cleverfiller_container.querySelector('#cf-hide-button') as HTMLButtonElement;
    const enlist_button = cleverfiller_container.querySelector('#cf-enlist-button') as HTMLButtonElement;
    const run_button = cleverfiller_container.querySelector('#cf-run-button') as HTMLButtonElement;
    const reset_button = cleverfiller_container.querySelector('#cf-reset-button') as HTMLButtonElement;

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

function add_dropdown_button_listener(cleverfiller_container: HTMLDivElement): void {

    const dropdown_button = cleverfiller_container.querySelector('#cf-load-button');
    const dropdown_container = cleverfiller_container.querySelector('.cf-dropdown-container');
    const preload_button = cleverfiller_container.querySelector('#cf-preload-button');
    const afterload_button = cleverfiller_container.querySelector('#cf-afterload-button');

    dropdown_button?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown_container) {
            dropdown_container.classList.toggle('active');
        }
    });
    document.addEventListener('click', (event) => {
        if (dropdown_container && !dropdown_container.contains(event.target as Node)) {
            dropdown_container.classList.remove('active');
        }
    });

    preload_button?.addEventListener('click', () => {
        hover_overlay_handler_for_load_button(scan_form_elements(), 'preload');
    });

    afterload_button?.addEventListener('click', () => {
        hover_overlay_handler_for_load_button(scan_form_elements(), 'afterload');
    });

}

function add_hide_button_listener(hide_button: HTMLButtonElement, container: HTMLDivElement): void {
    hide_button.addEventListener('click', () => {
        container.style.display = 'none';
    });
}

function add_enlist_button_listener(enlist_button: HTMLButtonElement, container: HTMLDivElement): void {
    enlist_button.addEventListener('click', () => {
        const inputtable_elements = scan_form_elements();
        highlight_form_elements(inputtable_elements);
        hover_overlay_handler_for_enlist_button(inputtable_elements);
        update_enlist_count();
    });
}

function add_reset_button_listener(reset_button: HTMLButtonElement, container: HTMLDivElement): void {
    reset_button.addEventListener('click', () => {
        const loadingText = container.querySelector('#cf-console-log') as HTMLElement;
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

function add_run_button_listener(run_button: HTMLButtonElement, container: HTMLDivElement): void {
    run_button.addEventListener('click', async () => {
        const loadingText = container.querySelector('#cf-console-log') as HTMLElement;
        const api_input = container.querySelector('#cf-api-input') as HTMLInputElement;
        const context_input = container.querySelector('#cf-context-textarea') as HTMLTextAreaElement;

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

        await new Promise(resolve => setTimeout(resolve, 800));

        try {
            if (PreloadCache.length > 0) {
                loadingText.textContent = `Executing ${PreloadCache.length} pre-fill actions...`;
                for (let i = 0; i < PreloadCache.length; i++) {
                    const element = PreloadCache[i];
                    loadingText.textContent = `Executing pre-fill action ${i + 1}/${PreloadCache.length}...`;
                    element.click();
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            for (let i = 0; i < EnlistCache.length; i++) {
                const cached_element = EnlistCache[i] as HTMLInputElement;
                const enlisted_element_attr = EnlistArray[i].attributeValues;

                cached_element.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
                cached_element.style.border = '2px solid #4a90e2';

                loadingText.textContent = `Processing field ${i + 1}/${EnlistCache.length}...`;

                try {
                    const prompt = create_prompt(context_input.value, enlisted_element_attr);
                    if (enlisted_element_attr.labelText) {
                        loadingText.textContent = `Processing ${enlisted_element_attr.labelText} (${i + 1}/${EnlistCache.length})...`;
                    }

                    const response = await call_deepseek_api(prompt);
                    const fieldValue = parse_ai_response(response);
                    console.log('[CleverFiller] Field Value:', fieldValue);
                    fill_form(cached_element, fieldValue);
                } catch (error) {
                    console.error('Error processing field:', error);
                    loadingText.textContent = `Error processing field ${i + 1}/${EnlistCache.length}`;
                    loadingText.style.color = '#f44336';
                }
            }
        } catch (error) {
            console.error('Error filling form:', error);
            loadingText.textContent = 'Check the console for errors.';
            loadingText.style.color = '#f44336';
        } finally {
            setTimeout(() => {
                run_button.disabled = false;
                loadingText.textContent = '';
            }, 1000);
        }
    });
}

createUI();