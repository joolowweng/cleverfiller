// ==UserScript==
// @name         CleverFiller
// @namespace    https://github.com/joolowweng/cleverfiller
// @version      2.6.0
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
// @resource     index https://raw.githubusercontent.com/joolowweng/cleverfiller/refs/heads/dev/html/dashboard.html
// @resource     css https://raw.githubusercontent.com/joolowweng/cleverfiller/refs/heads/dev/css/style.css
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

interface AppInfo {
    name: string;
    version: string;
}

function get_app_info(): AppInfo {

    const script = GM_info.script;
    const name = script.name;
    const version = script.version;
    return { name, version };
}

function get_window_url(): string {
    const url = window.location.href;
    return url;
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
                console.log('[CleverFiller] get_response(): Response Status:', response.status);
                if (response.status === 200) {
                    try {
                        resolve(JSON.parse(response.responseText) as T); // Resolve with the parsed response
                    } catch (error) {
                        console.error('[CleverFiller] get_response(): Failed to parse response:', error);
                        reject(new Error(`${error}`));
                    }
                } else {
                    console.error('[CleverFiller] get_response(): HTTP Error:', response.status);
                    reject(new Error(`${response.status}`)); // Resolve with null in case of error
                }
            },
            onerror: (error) => {
                console.error('[CleverFiller] get_response(): Request failed:', error);
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

function create_prompt(context: string, formData: Record<string, unknown>): string {
    // 检查是否有选项数据
    const options = formData['options'] || [];
    const isSelect = formData['elementType'] === 'select' || (Array.isArray(options) && options.length > 0);

    // 构建选项列表文本
    let optionsText = '';
    if (isSelect && Array.isArray(options)) {
        optionsText = '\n\n**Available options:**\n';
        (options as Array<{ value: string, text: string }>).forEach(option => {
            optionsText += `- ${option.text} (value: ${option.value})\n`;
        });
        optionsText += '\nPlease return the exact option text from the list above.\n';
    }

    const prompt = `
    You are a precise web form data analysis expert. Based on the form field information and the provided text, determine the most appropriate value to fill in.
    Always return the value in **English** (for example, for nationality, return "China" not "Chinese" or "中国"). Do not provide any explanation or extra text.

    **Analysis steps**:
    1. Analyze the field name, label text, and attributes to determine what type of information it is (name, email, phone, nationality, etc.)
    2. Find information in the text that is directly related to this field
    3. Check data format according to field type:
       - If it is an email, ensure the format is xxx@xxx.xxx
       - If it is a phone number, ensure it is a valid phone format
       - If it is a date, return in YYYY-MM-DD format
       - If it is a select menu, always return the visible English option text exactly as shown in the dropdown (not a translation or description)${isSelect ? '\n       - For this select field, only return one of the provided options listed below' : ''}

    **Field type**: ${formData['type'] || formData['elementType'] || 'text'}
    **Field name**: ${formData['name'] || ''}
    **Label text**: ${formData['labelText'] || ''}${optionsText}

    **Precise matching rules**:
    - If an exact match is found, use it directly
    - If there are multiple possible matches, choose the most relevant one
    - Only infer if you are highly confident
    - If you cannot determine the value, return an empty string

    -----------------------

    **Context information**:
    ${context}

    **Field details**:
    ${JSON.stringify(formData, null, 2)}
    `;
    console.log(prompt);
    return prompt;
}

function parse_ai_response(response: any, element?: HTMLElement): string {
    try {
        const msg_content = response?.choices?.[0]?.message?.content;
        if (!msg_content) {
            throw new Error('Invalid API response format');
        }

        let value = msg_content.trim();

        if (element) {
            const tagName = element.tagName.toLowerCase();
            const inputType = element.getAttribute('type')?.toLowerCase() || '';

            if (tagName === 'input') {
                if (inputType === 'email' && (!value.includes('@') || !value.includes('.'))) {
                    console.warn('[CleverFiller] parse_ai_response(): Invalid email format:', value);
                    value = '';
                } else if (inputType === 'date') {
                    const dateMatch = value.match(/\d{4}-\d{2}-\d{2}/);
                    if (dateMatch) {
                        value = dateMatch[0];
                    } else {
                        try {
                            const parsedDate = new Date(value);
                            if (!isNaN(parsedDate.getTime())) {
                                value = parsedDate.toISOString().split('T')[0];
                            }
                        } catch {
                            console.warn('[CleverFiller] parse_ai_response(): Invalid date format:', value);
                        }
                    }
                } else if (inputType === 'tel') {
                    value = value.replace(/[^\d+\-().\s]/g, '');
                } else if (inputType === 'number') {
                    value = value.replace(/[^\d.-]/g, '');
                }
            } else if (tagName === 'select') {
                const selectElement = element as HTMLSelectElement;
                const options = Array.from(selectElement.options);

                // Try to find the option by text match first
                let optionToSelect = options.find(opt =>
                    opt.text.trim().toLowerCase() === value.trim().toLowerCase()
                );

                // If not found, try to match by value
                if (!optionToSelect) {
                    optionToSelect = options.find(opt =>
                        opt.value.toLowerCase() === value.toLowerCase()
                    );
                }

                // If still not found, try partial match by text
                if (!optionToSelect) {
                    optionToSelect = options.find(opt =>
                        opt.text.toLowerCase().includes(value.trim().toLowerCase()) ||
                        value.trim().toLowerCase().includes(opt.text.toLowerCase())
                    );
                }

                if (optionToSelect) {
                    console.log(`[CleverFiller] parse_ai_response(): Select match found: "${value}" -> "${optionToSelect.text}" (${optionToSelect.value})`);
                    value = optionToSelect.value;
                } else {
                    console.warn(`[CleverFiller] parse_ai_response(): No matching option found for: "${value}"`);
                    // If no match is found, set value to empty string
                    value = '';
                }
            }
        }

        return value;
    } catch (error) {
        console.error('[CleverFiller] parse_ai_response(): Failed to parse API response:', error);
        return '';
    }
}

function highlight_form_elements(elements: Array<FormElement>): void {
    for (const element of elements) {
        element.style = `
        background-color: #e0f7fa;
        border: 2px solid #4a90e2;
        border-radius: 4px;
        transition: all 0.3s ease;
        `;
    }
}

function create_hover_overlays(
    elements: Array<FormElement>,
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

    for (const element of elements) {
        // Ensure the element is actually visible and interactable in the viewport
        const rect: DOMRect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || element.offsetParent === null) {
            console.log('[CleverFiller Debug] Skipping hidden or non-interactable element for overlay:', element);
            continue; // Skip elements that are not visible or positioned
        }

        const elementSignature = create_element_signature(element as HTMLElement);
        const isAlreadyEnlisted = dataMap.has(elementSignature);

        if (isAlreadyEnlisted) {
            // Check if the element is already in the runtime cache before adding
            if (cacheArray.indexOf(element as HTMLElement) === -1) {
                cacheArray.push(element as HTMLElement); // Add to cache only if not present
            }
        }

        // Create hover overlay
        const overlay: HTMLDivElement = document.createElement('div');
        overlay.className = isAlreadyEnlisted ? 'cleverfiller-hover-overlay-remove' : 'cleverfiller-hover-overlay-add';

        // Common styles
        overlay.style.position = 'absolute';
        overlay.style.top = `${rect.top + window.scrollY - 5}px`;
        overlay.style.left = `${rect.left + window.scrollX - 5}px`; // Use scrollX for horizontal scrolling
        overlay.style.width = `${rect.width + 10}px`;
        overlay.style.height = `${rect.height + 10}px`;
        // Increase z-index significantly to appear above most dialogs
        overlay.style.zIndex = '99999';
        overlay.style.cursor = 'pointer';
        overlay.style.border = '2px dashed transparent';
        overlay.style.boxSizing = 'border-box';
        // Prevent the overlay itself from blocking clicks on the underlying element if needed (optional)
        // overlay.style.pointerEvents = 'none'; // Add this if overlays interfere with element interaction

        // Label container styling
        const labelDiv = document.createElement('div');
        labelDiv.style.position = 'absolute';
        labelDiv.style.top = '0';
        labelDiv.style.right = '0';
        labelDiv.style.fontSize = '10px'; // Smaller font size
        labelDiv.style.padding = '2px 4px'; // Adjust padding
        labelDiv.style.borderRadius = '3px';
        labelDiv.style.color = 'white';
        labelDiv.style.whiteSpace = 'nowrap'; // Prevent wrapping
        // labelDiv.style.pointerEvents = 'auto'; // Ensure label is clickable if overlay has pointer-events: none

        if (isAlreadyEnlisted) {
            // Styles for removing elements
            overlay.style.backgroundColor = removeColor;
            labelDiv.style.backgroundColor = removeColor.replace('0.1', '0.8');
            labelDiv.textContent = removeLabel;

            overlay.addEventListener('mouseover', () => {
                overlay.style.border = `2px dashed ${removeColor.replace('0.1', '0.8')}`; // Use darker color for border
                overlay.style.backgroundColor = `${removeColor.replace('0.1', '0.2')}`;
                if (!overlay.contains(labelDiv)) { // Add label only if not already present
                    overlay.appendChild(labelDiv);
                }
            });
            overlay.addEventListener('mouseout', () => {
                overlay.style.border = '2px dashed transparent';
                overlay.style.backgroundColor = removeColor;
                if (overlay.contains(labelDiv)) { // Remove label on mouseout
                    overlay.removeChild(labelDiv);
                }
            });
            overlay.addEventListener('click', (e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault(); // Prevent default action just in case
                overlay.remove();
                removeCallback(element as HTMLElement);

                // Recreate overlays immediately after removing one
                create_hover_overlays(
                    elements.filter(el => el !== element), // Pass remaining elements
                    cacheArray,
                    dataArray.filter(d => create_element_signature(d) !== elementSignature), // Pass remaining data
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
            labelDiv.style.backgroundColor = addColor.replace('0.1', '0.8');
            labelDiv.textContent = addLabel;

            overlay.addEventListener('mouseover', () => {
                overlay.style.border = `2px dashed ${addColor.replace('0.1', '0.8')}`; // Use darker color for border
                overlay.style.backgroundColor = `${addColor.replace('0.1', '0.2')}`;
                if (!overlay.contains(labelDiv)) { // Add label only if not already present
                    overlay.appendChild(labelDiv);
                }
            });
            overlay.addEventListener('mouseout', () => {
                overlay.style.border = '2px dashed transparent';
                overlay.style.backgroundColor = addColor;
                if (overlay.contains(labelDiv)) { // Remove label on mouseout
                    overlay.removeChild(labelDiv);
                }
            });
            overlay.addEventListener('click', (e: MouseEvent) => {
                e.stopPropagation();
                e.preventDefault(); // Prevent default action just in case
                overlay.remove();
                addCallback(element as HTMLElement);

                // Recreate overlays immediately after adding one
                create_hover_overlays(
                    elements.filter(el => el !== element), // Pass remaining elements
                    cacheArray,
                    [...dataArray, extract_data_for_enlist_storage(element as HTMLElement)], // Pass updated data
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

function hover_overlay_handler_for_enlist_button(elements: Array<FormElement>): void {
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

// 2025.04.12: Updated to handle FormElement array type
function hover_overlay_handler_for_load_button(elements: Array<FormElement>, loader_method: string): void {
    if (loader_method === 'preload') {
        create_hover_overlays(
            elements,
            PreloadCache,
            PreloadArray,
            (element) => {
                const data = extract_data_for_enlist_storage(element as HTMLElement);
                PreloadArray.push(data);
                PreloadCache.push(element as HTMLElement);
                GM_setValue(get_window_url(), {
                    ...GM_getValue(get_window_url(), default_cache),
                    preload: PreloadArray
                });
                update_load_count();
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
                const data = extract_data_for_enlist_storage(element as HTMLElement);
                AfterloadArray.push(data);
                AfterloadCache.push(element as HTMLElement);
                GM_setValue(get_window_url(), {
                    ...GM_getValue(get_window_url(), default_cache),
                    afterload: AfterloadArray
                });
                update_load_count();
            },
            remove_afterload_element,
            'rgba(74, 144, 226, 0.1)', // Add color
            'rgba(244, 67, 54, 0.1)',  // Remove color
            'Add to Afterload',        // Add label
            'Remove'                   // Remove label
        );
    }
}

// Make sure the fill_form function can handle buttons correctly
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
        let optionToSelect = Array.from(selectElement.options).find(option => option.value === value);
        if (!optionToSelect) {
            optionToSelect = Array.from(selectElement.options).find(option =>
                option.text.trim().toLowerCase() === value.trim().toLowerCase()
            );
        }
        // If still not found, try partial match by text
        if (!optionToSelect) {
            optionToSelect = Array.from(selectElement.options).find(option =>
                option.text.toLowerCase().includes(value.trim().toLowerCase())
            );
        }
        if (optionToSelect) {
            selectElement.value = optionToSelect.value;

            // Trigger change event for select elements
            setTimeout(() => {
                element.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`[CleverFiller] Select option set to: "${optionToSelect.value}"`);
            }, 100);
        }
    } else if (element.tagName === 'BUTTON') {
        // For buttons, we don't set values but could trigger a click if needed
        console.log(`[CleverFiller] Button element - no value to set: "${element.textContent}"`);
    }

    // Reset any special styling applied during processing
    setTimeout(() => {
        element.style.backgroundColor = '';
        element.style.border = '';
    }, 500);
}

// Define default selectors for form element scanning
const DEFAULT_ENLIST_TAGS = 'input, textarea, select, button';
const DEFAULT_LOAD_TAGS = 'button[type="submit"], input[type="submit"], button.submit, a.btn';

// Define a union type for form elements
type FormElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement;

// 2025.04.14: Updated to initialize default values for custom CSS selectors
function initialize_default_selectors(): void {
    // Only set defaults if they don't already exist in GM_Value
    if (GM_getValue('enlist_tags', null) === null) {
        GM_setValue('enlist_tags', DEFAULT_ENLIST_TAGS);
        console.log('[CleverFiller] Initialized default enlist tags:', DEFAULT_ENLIST_TAGS);
    }

    if (GM_getValue('load_tags', null) === null) {
        GM_setValue('load_tags', DEFAULT_LOAD_TAGS);
        console.log('[CleverFiller] Initialized default load tags:', DEFAULT_LOAD_TAGS);
    }
}

// 2025.04.14: Enhanced to support custom CSS selectors with improved defaults
function scan_form_elements(customSelector?: string): Array<FormElement> {
    // Use custom selector if provided, otherwise use the saved selector or default
    const savedSelector = customSelector || GM_getValue('enlist_tags', DEFAULT_ENLIST_TAGS);
    const selector = savedSelector || DEFAULT_ENLIST_TAGS;

    try {
        const allInputs = document.querySelectorAll<FormElement>(selector);
        // Exclude elements within div[id="cleverfiller-container"]
        const filteredInputs = Array.from(allInputs).filter(input => {
            const parentDiv = input.closest('div#cleverfiller-container');
            return !parentDiv;
        });

        console.log(`[CleverFiller] Found ${filteredInputs.length} elements with selector: ${selector}`);
        return filteredInputs;
    } catch (error) {
        console.error(`[CleverFiller] Invalid selector: ${selector}`, error);
        // Fallback to default selector if custom one fails
        const defaultInputs = document.querySelectorAll<FormElement>(DEFAULT_ENLIST_TAGS);
        return Array.from(defaultInputs).filter(input => !input.closest('div#cleverfiller-container'));
    }
}
function get_label_text(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement): string {
    // 1. Check for explicit label using 'for' attribute matching element's id
    if (element.id) {
        const explicitLabel = document.querySelector(`label[for="${element.id}"]`);
        if (explicitLabel && explicitLabel.textContent) {
            console.log(`[CleverFiller Debug] Label found via 'for': ${explicitLabel.textContent.trim()}`);
            return explicitLabel.textContent.trim();
        }
    }

    // 2. Check aria-labelledby attribute
    const labelledby = element.getAttribute('aria-labelledby');
    if (labelledby) {
        const labelElement = document.getElementById(labelledby);
        if (labelElement && labelElement.textContent) {
            console.log(`[CleverFiller Debug] Label found via 'aria-labelledby': ${labelElement.textContent.trim()}`);
            return labelElement.textContent.trim();
        }
    }

    // 3. Check aria-label attribute directly on the element
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
        console.log(`[CleverFiller Debug] Label found via 'aria-label': ${ariaLabel.trim()}`);
        return ariaLabel.trim();
    }

    // 4. Table-specific logic (Improved)
    const parentRow = element.closest('tr');
    if (parentRow) {
        const cells = Array.from(parentRow.cells);
        const inputCell = element.closest('td, th');
        const inputCellIndex = inputCell ? cells.indexOf(inputCell as HTMLTableCellElement) : -1;

        // Search backwards from the input's cell for a potential label cell
        if (inputCellIndex > 0) {
            for (let i = inputCellIndex - 1; i >= 0; i--) {
                const potentialLabelCell = cells[i];
                // Check if the cell has a class indicating it's a label
                if (potentialLabelCell.matches('td[class*="label" i], th[class*="label" i]')) {
                    const labelElement = potentialLabelCell.querySelector('label');
                    if (labelElement && labelElement.textContent) {
                        console.log(`[CleverFiller Debug] Label found in preceding table cell (class*="label"): ${labelElement.textContent.trim()}`);
                        return labelElement.textContent.trim();
                    }
                    // Fallback to cell content if no label tag inside but class matches
                    if (potentialLabelCell.textContent) {
                        console.log(`[CleverFiller Debug] Label found via preceding table cell content (class*="label"): ${potentialLabelCell.textContent.trim()}`);
                        return potentialLabelCell.textContent.trim();
                    }
                    break; // Found the designated label cell, stop searching
                }
                // Check if the cell directly contains a label tag (even without specific class)
                const directLabel = potentialLabelCell.querySelector('label');
                if (directLabel && directLabel.textContent) {
                    console.log(`[CleverFiller Debug] Label found in preceding table cell (direct label): ${directLabel.textContent.trim()}`);
                    return directLabel.textContent.trim();
                }
            }
        }
        // Fallback: If no preceding label found, check the very first cell in the row
        if (cells.length > 0) {
            const firstCellLabel = cells[0].querySelector('label');
            if (firstCellLabel && firstCellLabel.textContent) {
                console.log(`[CleverFiller Debug] Label found via first table cell (label tag): ${firstCellLabel.textContent.trim()}`);
                return firstCellLabel.textContent.trim();
            }
            // Only use first cell text if it has a label-like class
            if (cells[0].matches('td[class*="label" i], th[class*="label" i]') && cells[0].textContent) {
                console.log(`[CleverFiller Debug] Label found via first table cell content (class*="label"): ${cells[0].textContent.trim()}`);
                return cells[0].textContent.trim();
            }
        }
    }

    // 5. Check label as immediate preceding sibling
    let previousSibling = element.previousElementSibling;
    while (previousSibling) {
        if (previousSibling.tagName === 'LABEL') {
            if (previousSibling.textContent) {
                console.log(`[CleverFiller Debug] Label found via previous sibling: ${previousSibling.textContent.trim()}`);
                return previousSibling.textContent.trim();
            }
            break; // Found label, stop
        }
        // Stop if we hit an element that's likely not just formatting between label and input
        if (['BR', 'SPAN'].indexOf(previousSibling.tagName) === -1) {
            break;
        }
        previousSibling = previousSibling.previousElementSibling;
    }

    // 6. Check label within closest container (div, p, li, fieldset)
    const container = element.closest('div, p, li, fieldset');
    if (container) {
        // Find the first label within the container that isn't explicitly for another element
        const containerLabels = Array.from(container.querySelectorAll('label'));
        const suitableLabel = containerLabels.find(lbl => !lbl.hasAttribute('for') || lbl.getAttribute('for') === element.id);
        if (suitableLabel && suitableLabel.textContent) {
            console.log(`[CleverFiller Debug] Label found in container: ${suitableLabel.textContent.trim()}`);
            return suitableLabel.textContent.trim();
        }
    }

    // 7. Use placeholder text as a fallback
    const placeholder_text = ('placeholder' in element) ? element.placeholder || '' : '';
    if (placeholder_text) {
        console.log(`[CleverFiller Debug] Label found via placeholder: ${placeholder_text}`);
        return placeholder_text;
    }

    // 8. Use button text if it's a button
    const button_text = element.tagName === 'BUTTON' ? element.textContent?.trim() || '' : '';
    if (button_text) {
        console.log(`[CleverFiller Debug] Label found via button text: ${button_text}`);
        return button_text;
    }

    // Final fallback
    console.log(`[CleverFiller Debug] No label found for element:`, element.id || element.name || element);
    return '';
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

        update_load_count(); // Update load count after removing from preload
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

        update_load_count(); // Update load count after removing from afterload
    }
}

// Extract data to create the enlist object
function extract_data_for_enlist_storage(element: HTMLElement): Record<string, any> {
    const labelText = get_label_text(element as HTMLInputElement);
    const attributeValues = filter_redundant_attributes(element);

    interface SelectOption {
        value: string;
        text: string;
    }

    let options: Array<SelectOption> = [];
    if (element.tagName === 'SELECT') {
        const selectElement = element as HTMLSelectElement;
        options = Array.from(selectElement.options).map(option => ({
            value: option.value,
            text: option.text
        }));
    }

    const data = {
        labelText: labelText,
        attributeValues: attributeValues,
        options: options,
        elementType: element.tagName.toLowerCase()
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

// 2025-04-11 @ 11:28:50: Added tab navigation functionality
function setupTabNavigation(container: HTMLDivElement): void {
    const tabs = container.querySelectorAll<TabElement>('.cf-nav-tab');
    const tabContentContainer = container.querySelector<HTMLElement>('#cleverfiller-inner-body');

    if (!tabContentContainer) {
        console.error('Tab content container not found');
        return;
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Add active class to the clicked tab
            tab.classList.add('active');

            // Get the target ID from the clicked tab's dataset
            const tabName = tab.dataset.tab;
            const targetId = `cf-tab-${tabName}`;

            // Hide all tab contents
            const contents = tabContentContainer.querySelectorAll<HTMLElement>('.cf-tab-content');
            contents.forEach(content => {
                content.classList.remove('active');
            });

            // Show the target tab content
            const targetContent = tabContentContainer.querySelector<HTMLElement>(`#${targetId}`);

            if (targetContent) {
                targetContent.classList.add('active');
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

function update_load_count(): void {
    const countBadge = document.querySelector<HTMLElement>('#cf-load-count');
    if (countBadge) {
        const total_load_count = PreloadArray.length + AfterloadArray.length;
        if (total_load_count === 0) {
            countBadge.style.display = 'none'; // Hide the badge if no elements are enlisted
        }
        else {
            countBadge.style.display = 'flex';
            countBadge.textContent = total_load_count.toString();
        }
    }
}

function setup_auto_save(container: HTMLDivElement): void {
    const api_input = container.querySelector('#cf-api-input') as HTMLInputElement;
    const model_option = container.querySelector('#cf-model-select') as HTMLSelectElement;
    const context_input = container.querySelector('#cf-context-textarea') as HTMLTextAreaElement;
    const initial_display = container.querySelector('#cf-initial-display') as HTMLInputElement;
    // 2025.04.13: Added tag inputs for saving custom selectors
    const enlist_tags = container.querySelector('#cf-enlist-tags') as HTMLInputElement;
    const load_tags = container.querySelector('#cf-load-tags') as HTMLInputElement;

    // 2025.04.14: Add reset buttons for tag fields
    const reset_enlist_tags_button = container.querySelector('#cf-reset-enlist-tags') as HTMLButtonElement;
    const reset_load_tags_button = container.querySelector('#cf-reset-load-tags') as HTMLButtonElement;

    const save_value = (key: string, value: string | boolean) => {
        GM_setValue(key, value);
    };

    api_input.addEventListener('input', () => save_value('api', api_input.value));
    model_option.addEventListener('change', () => save_value('model', model_option.value));
    context_input.addEventListener('input', () => save_value('context', context_input.value));
    initial_display.addEventListener('change', () => save_value('initial_display', initial_display.checked));
    // 2025.04.13: Add event listeners for tag inputs
    enlist_tags.addEventListener('input', () => save_value('enlist_tags', enlist_tags.value));
    load_tags.addEventListener('input', () => save_value('load_tags', load_tags.value));

    // 2025.04.14: Add event listeners for reset buttons
    if (reset_enlist_tags_button) {
        reset_enlist_tags_button.addEventListener('click', () => {
            enlist_tags.value = DEFAULT_ENLIST_TAGS;
            save_value('enlist_tags', DEFAULT_ENLIST_TAGS);
            console.log('[CleverFiller] Reset enlist tags to default:', DEFAULT_ENLIST_TAGS);
        });
    }

    if (reset_load_tags_button) {
        reset_load_tags_button.addEventListener('click', () => {
            load_tags.value = DEFAULT_LOAD_TAGS;
            save_value('load_tags', DEFAULT_LOAD_TAGS);
            console.log('[CleverFiller] Reset load tags to default:', DEFAULT_LOAD_TAGS);
        });
    }
}

// Add function to reset tags to default values
function reset_tags_to_default(): void {
    GM_setValue('enlist_tags', DEFAULT_ENLIST_TAGS);
    GM_setValue('load_tags', DEFAULT_LOAD_TAGS);

    // Update UI if elements exist
    const enlistTagsInput = document.querySelector('#cf-enlist-tags') as HTMLInputElement;
    const loadTagsInput = document.querySelector('#cf-load-tags') as HTMLInputElement;

    if (enlistTagsInput) enlistTagsInput.value = DEFAULT_ENLIST_TAGS;
    if (loadTagsInput) loadTagsInput.value = DEFAULT_LOAD_TAGS;

    console.log('[CleverFiller] Reset tags to default values');
}

// 2025-04-11 @ 11:28:50: Extracted the HTML to a separate file for better maintainability.
function createUI(): void {
    // Append the CSS styles to the document head
    append_css();
    // Initialize default selectors on startup
    initialize_default_selectors();

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
    const initial_display = container.querySelector('#cf-initial-display') as HTMLInputElement;
    initial_display.checked = GM_getValue('initial_display', false);

    // 2025.04.14: Load tag inputs from saved settings with defaults
    const enlist_tags = container.querySelector('#cf-enlist-tags') as HTMLInputElement;
    enlist_tags.value = GM_getValue('enlist_tags', DEFAULT_ENLIST_TAGS);
    const load_tags = container.querySelector('#cf-load-tags') as HTMLInputElement;
    load_tags.value = GM_getValue('load_tags', DEFAULT_LOAD_TAGS);

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
    add_enlist_button_listener(enlist_button);
    add_reset_button_listener(reset_button, cleverfiller_container);
    add_run_button_listener(run_button, cleverfiller_container);

    setTimeout(() => {
        // Set up auto-save functionality
        setup_auto_save(cleverfiller_container);
        update_enlist_count();
        update_load_count(); // Update load count on initial load
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
        // 2025.04.14: Use saved load tags or default for preload button
        const customSelector = GM_getValue('load_tags', DEFAULT_LOAD_TAGS);
        hover_overlay_handler_for_load_button(scan_form_elements(customSelector), 'preload');
        update_load_count();
    });

    afterload_button?.addEventListener('click', () => {
        // 2025.04.14: Use saved load tags or default for afterload button
        const customSelector = GM_getValue('load_tags', DEFAULT_LOAD_TAGS);
        hover_overlay_handler_for_load_button(scan_form_elements(customSelector), 'afterload');
        update_load_count();
    });
}

function add_hide_button_listener(hide_button: HTMLButtonElement, container: HTMLDivElement): void {
    hide_button.addEventListener('click', () => {
        container.style.display = 'none';
    });
}

function add_enlist_button_listener(enlist_button: HTMLButtonElement): void {
    enlist_button.addEventListener('click', () => {
        // 2025.04.14: Use saved enlist tags or default
        const customSelector = GM_getValue('enlist_tags', DEFAULT_ENLIST_TAGS);
        const inputtable_elements = scan_form_elements(customSelector);
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

        // 分别处理enlist和load元素
        EnlistCache.length = 0;
        PreloadCache.length = 0; // 确保清空PreloadCache
        AfterloadCache.length = 0; // 确保清空AfterloadCache

        // 扫描enlist元素
        const enlistSelector = GM_getValue('enlist_tags', DEFAULT_ENLIST_TAGS);
        hover_overlay_handler_for_enlist_button(scan_form_elements(enlistSelector));

        // 扫描load元素 (preload)
        const loadSelector = GM_getValue('load_tags', DEFAULT_LOAD_TAGS);
        hover_overlay_handler_for_load_button(scan_form_elements(loadSelector), 'preload');

        // 检查是否有任何元素可以处理
        if (EnlistCache.length === 0 && PreloadCache.length === 0 && AfterloadCache.length === 0) {
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

        // 更新消息以反映实际情况
        const totalFields = EnlistCache.length + PreloadCache.length;
        loadingText.textContent = `Preparing to process ${totalFields} elements...`;
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
                // Pass the entire object instead of just attributeValues
                const enlisted_element_data = EnlistArray[i];

                cached_element.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
                cached_element.style.border = '2px solid #4a90e2';

                loadingText.textContent = `Processing field ${i + 1}/${EnlistCache.length}...`;

                try {
                    const prompt = create_prompt(context_input.value, enlisted_element_data);
                    if (enlisted_element_data.labelText) {
                        loadingText.textContent = `Processing ${enlisted_element_data.labelText} (${i + 1}/${EnlistCache.length})...`;
                    }

                    const response = await call_deepseek_api(prompt);
                    const fieldValue = parse_ai_response(response, cached_element);
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

function append_css(): void {

    const style = document.createElement('style');
    style.textContent = GM_getResourceText('css');
    document.head.appendChild(style);
    console.log('[CleverFiller] CSS styles injected successfully.');

}

createUI();