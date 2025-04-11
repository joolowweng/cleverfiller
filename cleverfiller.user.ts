// ==UserScript==
// @name         CleverFiller Beta
// @namespace    https://github.com/joolowweng/cleverfiller
// @version      1.2.5
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

// 2025-04-11 @ 10:02:49: Modify the logic that includes elements in the list rather than excluding them.
const EnlistArray: Array<Record<string, any>> = GM_getValue('enlist', []);

function get_app_info(): { name: string; version: string } {

    const script = GM_info.script;
    const name = script.name;
    const version = script.version;

    return { name, version };

}

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

function create_prompt(context: string, formData: Array<Record<string, unknown>>): string {
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

function parse_ai_response(response: any): Array<Record<string, unknown>> {
    try {
        const msg_content = response?.choices?.[0]?.message?.content;
        if (!msg_content) {
            throw new Error('Invalid API response format')
        }
        const cleanStringData = msg_content.substring(msg_content.indexOf('['), msg_content.lastIndexOf(']') + 1);
        return JSON.parse(cleanStringData);
    } catch (error) {
        console.error('Failed to parse API response:', error);
        return [];
    }
}

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

function get_label_text(element: HTMLInputElement): string {
    // Get the label text of the element
    const parentDiv = element.closest('div');
    let labelText = parentDiv ? parentDiv.querySelector('label')?.textContent || '' : ''; // Get the label text
    if (labelText === '') {
        // Look for the parent <tr> element to find the sibling <td> element
        const parentTr = element.closest('tr');
        const siblingTd = parentTr ? parentTr.querySelector('td') : null;
        labelText = siblingTd ? siblingTd.textContent || '' : '';
    }
    return labelText; // Return the label text
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

// 2025.04.11: Tweaked style of highlighted elements.
function highlight_form_elements(elements: NodeListOf<HTMLInputElement>): void {

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

function hover_overlay_handler(elements: NodeListOf<HTMLInputElement>): void {
    for (const element of Array.from(elements)) {
        // 获取元素位置
        const rect: DOMRect = element.getBoundingClientRect();

        // 创建透明覆盖层
        const overlay: HTMLDivElement = document.createElement('div');
        overlay.className = 'cleverfiller-hover-overlay';

        // 设置样式 - 完全透明
        // Position and size - adding padding to make it easier to click
        overlay.style.position = 'absolute';
        overlay.style.top = `${rect.top + window.scrollY - 5}px`;  // 5px padding on top
        overlay.style.left = `${rect.left - 5}px`;                 // 5px padding on left
        overlay.style.width = `${rect.width + 10}px`;              // Add 10px total width (5px on each side)
        overlay.style.height = `${rect.height + 10}px`;            // Add 10px total height (5px on each side)
        overlay.style.zIndex = '999';
        overlay.style.backgroundColor = 'rgba(74, 144, 226, 0.1)'; // Slight background for better visibility
        overlay.style.cursor = 'pointer';
        overlay.style.border = '2px dashed transparent';
        overlay.style.boxSizing = 'border-box';                    // Ensure padding doesn't affect overall size

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

        // 点击事件
        overlay.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation(); // 阻止事件冒泡
            overlay.remove(); // 移除覆盖层
            enlist_element(element); // 调用函数处理点击事件
        });

        document.body.appendChild(overlay);
    }
}


function enlist_element(element: HTMLElement) {
    // Generate a unique identifier for this element to prevent duplicates
    const attributeValues = get_element_attributes(element as HTMLElement);
    const url = get_window_url();
    const labelText = get_label_text(element as HTMLInputElement);

    // Create an element signature for comparison
    const elementSignature = `${url}|${labelText}|${JSON.stringify(attributeValues)}`;

    // Check if element is already enlisted to prevent duplicates
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
        console.log('Enlisted element:', data);
    }
}

function get_window_url(): string {
    const url = window.location.href; // Get the current URL of the window
    return url; // Return the URL
}

function get_element_attributes(element: HTMLElement): { [key: string]: string } {
    const attributes: NamedNodeMap = element.attributes;
    const attributeValues: { [key: string]: string } = {};
    for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];
        attributeValues[attr.name] = attr.value;
    }
    return attributeValues; // Return the attribute values as an object
}

// 2025-04-11 @ 11:28:50: Extracted the HTML to a separate file for better maintainability.
function createUI(): void {
    const container = document.createElement('div');
    const container_html = GM_getResourceText('index');
    container.innerHTML = container_html;
    document.body.appendChild(container);
    const cleverfiller_container = container.querySelector('#cleverfiller-container') as HTMLDivElement;

    const heading = container.querySelector('#cf-app-name') as HTMLHeadingElement;
    heading.textContent = `${get_app_info().name}`;
    const api_input = container.querySelector('#cf-api-input') as HTMLInputElement;
    api_input.value = GM_getValue('api', '');
    const model_option = container.querySelector('#cf-model-select') as HTMLSelectElement;
    model_option.value = GM_getValue('model', 'deepseek-chat');
    const version = container.querySelector('#cf-version-info') as HTMLSpanElement;
    version.textContent = `version: ${get_app_info().version}`;
    const context_input = container.querySelector('#cf-context-textarea') as HTMLTextAreaElement;
    context_input.value = GM_getValue('context', '');

    function activate_clever_filler_display(event: KeyboardEvent): void {
        if (event.altKey && (event.key.toLowerCase() === 's')) {
            event.preventDefault();
            cleverfiller_container.style.display = 'block';
        }
    }
    document.addEventListener('keydown', activate_clever_filler_display);

    // 2025.04.10: Fully redesigned the header to improve aesthetics and usability.
    const hide_button = cleverfiller_container.querySelector('#cf-hide-button') as HTMLButtonElement;
    const hightlight_button = cleverfiller_container.querySelector('#cf-enlist-button') as HTMLButtonElement;
    const submit_button = cleverfiller_container.querySelector('#cf-submit-button') as HTMLButtonElement;

    setTimeout(() => {

        hide_button.addEventListener('click', () => {
            cleverfiller_container.style.display = 'none';
        });

        hightlight_button.addEventListener('click', () => {
            const inputtable_elements = scan_form_elements();
            highlight_form_elements(inputtable_elements);
            hover_overlay_handler(inputtable_elements);
        });

        submit_button.addEventListener('click', async () => {
            // Get elements for animation
            const loadingText = cleverfiller_container.querySelector('#loading-text') as HTMLElement;

            loadingText.style.display = 'inline-block';
            submit_button.disabled = true;

            // Save settings (with a small delay to see the animation)
            setTimeout(() => {
                // Save the settings
                GM_setValue('api', api_input.value);
                GM_setValue('model', model_option.value);
                GM_setValue('context', context_input.value);

                // Show success state
                loadingText.textContent = 'Saved';
                loadingText.style.color = '#4CAF50';

                setTimeout(() => {
                    loadingText.style.display = 'none';
                    loadingText.style.color = '#4a90e2';
                    submit_button.disabled = false;
                }, 100);
            }, 100);  // Short delay to make the animation visible
        });

    }, 500);
}

createUI();