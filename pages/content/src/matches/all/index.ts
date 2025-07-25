import { ElementSelector, FormDetector, FormFiller, ElementMarker } from '@extension/shared';
import type { FormFillRequest } from '@extension/shared';

console.log('[LovpenSider] Content script loaded');

class LovpenSiderElementSelector extends ElementSelector {
  protected onElementSelected(): void {
    const data = this.getSelectedElementData();
    if (data) {
      // 发送数据到侧边栏
      chrome.runtime.sendMessage({
        action: 'elementSelected',
        html: data.html,
        markdown: data.markdown,
        slug: data.slug,
        domPath: data.domPath,
      });
    }

    // 通知侧边栏导航模式已退出
    chrome.runtime.sendMessage({
      action: 'navigationExited',
    });
  }

  protected onElementDataUpdate(): void {
    const data = this.getSelectedElementData();
    if (data) {
      // 实时更新侧边栏中的数据
      chrome.runtime.sendMessage({
        action: 'elementDataUpdate',
        html: data.html,
        markdown: data.markdown,
        slug: data.slug,
        domPath: data.domPath,
      });
    }
  }

  protected onSelectionCancelled(): void {
    // 通知侧边栏选择已停止
    chrome.runtime.sendMessage({
      action: 'selectionStopped',
    });
  }
}

// 创建选择器实例
const selector = new LovpenSiderElementSelector({
  enableNavigation: true,
  showStatusMessages: true,
});

// 创建表单处理实例
const formDetector = new FormDetector();
const formFiller = new FormFiller();

// 创建元素标记实例
const elementMarker = new ElementMarker();

// 监听来自侧边栏的消息
chrome.runtime.onMessage.addListener(
  (request: unknown, _sender: unknown, sendResponse: (response?: unknown) => void) => {
    if (!request || typeof request !== 'object') return false;

    const msg = request as { action?: string; domPath?: string; text?: string; data?: unknown };
    if (msg.action === 'startSelection') {
      selector.startSelection();
      sendResponse({ success: true });
    } else if (msg.action === 'stopSelection') {
      selector.stopSelection();
      sendResponse({ success: true });
    } else if (msg.action === 'smartSelect') {
      selector.smartSelect();
      sendResponse({ success: true });
    } else if (msg.action === 'applyDomPath') {
      try {
        const element = document.querySelector(msg.domPath || '');
        if (element) {
          selector.setSelectedElement(element);
          selector.highlightSelectedElement();
          selector.triggerElementSelected(element);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: '未找到指定元素' });
        }
      } catch {
        sendResponse({ success: false, error: '无效的DOM路径' });
      }
    } else if (msg.action === 'copyToClipboard') {
      // 处理剪贴板复制请求
      if (msg.text) {
        navigator.clipboard
          .writeText(msg.text)
          .then(() => {
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error('[LovpenSider] Failed to copy to clipboard:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // 保持消息通道开放
      } else {
        sendResponse({ success: false, error: '没有提供要复制的文本' });
      }
    } else if (msg.action === 'detectForms') {
      // 检测表单
      try {
        const forms = formDetector.detectForms();

        // 视觉标记检测到的表单字段
        formDetector.highlightFormFields(forms);

        sendResponse({
          success: true,
          message: `检测到 ${forms.length} 个表单，已在页面上标记字段`,
          data: forms.map(form => ({
            formSelector: form.formSelector,
            formType: form.formType,
            confidence: form.confidence,
            fields: form.fields.map(field => ({
              id: field.id,
              type: field.type,
              label: field.label,
              required: field.required,
            })),
          })),
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '表单检测失败',
        });
      }
    } else if (msg.action === 'fillForm') {
      // 填写表单
      if (msg.data) {
        formFiller
          .fillForm(msg.data as FormFillRequest)
          .then(result => {
            sendResponse({
              success: result.success,
              message: result.message,
              data: {
                filledCount: result.filledCount,
                failedFields: result.failedFields,
                duration: result.duration,
              },
            });
          })
          .catch(error => {
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : '填写表单失败',
            });
          });
        return true; // 保持消息通道开放
      } else {
        sendResponse({ success: false, error: '没有提供表单数据' });
      }
    } else if (msg.action === 'clearForm') {
      // 清空表单
      try {
        const result = formFiller.clearForm(
          (msg.data as { formSelector?: string })?.formSelector || 'form:first-of-type',
        );
        sendResponse({
          success: result.success,
          message: result.message,
          data: {
            filledCount: result.filledCount,
            duration: result.duration,
          },
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '清空表单失败',
        });
      }
    } else if (msg.action === 'validateForm') {
      // 验证表单
      try {
        const result = formFiller.validateForm(
          (msg.data as { formSelector?: string })?.formSelector || 'form:first-of-type',
        );
        sendResponse({
          success: result.isValid,
          message: result.isValid ? '表单验证通过' : '表单验证失败',
          data: {
            isValid: result.isValid,
            errors: result.errors,
          },
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '表单验证失败',
        });
      }
    } else if (msg.action === 'clearHighlights') {
      // 清除表单高亮
      try {
        formDetector.clearHighlights();
        sendResponse({
          success: true,
          message: '已清除表单字段标记',
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '清除标记失败',
        });
      }
    } else if (msg.action === 'highlightForm') {
      // 高亮指定表单
      try {
        const formSelector = (msg.data as { formSelector?: string })?.formSelector || 'form:first-of-type';
        formDetector.highlightSpecificForm(formSelector);
        sendResponse({
          success: true,
          message: `已标记表单 ${formSelector} 的字段`,
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '标记表单失败',
        });
      }
    } else if (msg.action === 'debugForms') {
      // 调试表单检测
      try {
        console.log('=== 表单调试信息 ===');

        // 检测所有form标签
        const formTags = Array.from(document.querySelectorAll('form'));
        console.log(`找到 ${formTags.length} 个 <form> 标签:`);
        formTags.forEach((form, index) => {
          const inputs = form.querySelectorAll('input, textarea, select');
          console.log(`  表单 ${index + 1}: ${inputs.length} 个字段`, form);
        });

        // 检测所有输入元素
        const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'));
        console.log(`\n页面总共有 ${allInputs.length} 个输入元素:`);
        allInputs.forEach((input, index) => {
          const htmlInput = input as HTMLInputElement;
          console.log(
            `  ${index + 1}. ${htmlInput.tagName} [${htmlInput.type || 'text'}] - ${htmlInput.name || htmlInput.id || '无标识'}`,
          );
        });

        // 运行完整检测
        const forms = formDetector.detectForms();
        console.log(`\n检测结果: ${forms.length} 个表单`);
        forms.forEach((form, index) => {
          console.log(
            `表单 ${index + 1}: ${form.formSelector} (${form.formType}, 置信度: ${Math.round(form.confidence * 100)}%)`,
          );
          console.log(`  包含 ${form.fields.length} 个字段:`);
          form.fields.forEach((field, fieldIndex) => {
            console.log(`    ${fieldIndex + 1}. ${field.type}: ${field.label || '无标签'} - ${field.selector}`);
          });
        });

        sendResponse({
          success: true,
          message: '调试信息已输出到浏览器控制台（F12 > Console）',
          data: {
            formTags: formTags.length,
            totalInputs: allInputs.length,
            detectedForms: forms.length,
          },
        });
      } catch (error) {
        console.error('调试失败:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '调试失败',
        });
      }
    } else if (msg.action === 'markAllElements') {
      // 标记所有元素
      try {
        const elements = elementMarker.markAllElements();
        const stats = elementMarker.getMarkingStats();

        sendResponse({
          success: true,
          message: `已标记 ${elements.length} 个元素`,
          data: {
            totalElements: elements.length,
            stats,
            elements: elements.map(el => ({
              type: el.type,
              label: el.label,
              selector: el.selector,
            })),
          },
        });
      } catch (error) {
        console.error('标记所有元素失败:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '标记失败',
        });
      }
    } else if (msg.action === 'markInputs') {
      // 标记输入元素
      try {
        const elements = elementMarker.markInputElements();

        sendResponse({
          success: true,
          message: `已标记 ${elements.length} 个输入元素`,
          data: {
            totalElements: elements.length,
            elements: elements.map(el => ({
              type: el.type,
              label: el.label,
              selector: el.selector,
            })),
          },
        });
      } catch (error) {
        console.error('标记输入元素失败:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '标记失败',
        });
      }
    } else if (msg.action === 'markContainers') {
      // 标记容器元素
      try {
        const elements = elementMarker.markContainerElements();

        sendResponse({
          success: true,
          message: `已标记 ${elements.length} 个容器元素`,
          data: {
            totalElements: elements.length,
            elements: elements.map(el => ({
              type: el.type,
              label: el.label,
              selector: el.selector,
            })),
          },
        });
      } catch (error) {
        console.error('标记容器元素失败:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '标记失败',
        });
      }
    } else if (msg.action === 'clearAllMarks') {
      // 清除所有标记
      try {
        elementMarker.clearMarkers();

        sendResponse({
          success: true,
          message: '已清除所有元素标记',
        });
      } catch (error) {
        console.error('清除标记失败:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '清除失败',
        });
      }
    } else if (msg.action === 'fillAllTextInputs') {
      // 填充所有文本输入框
      try {
        const text = (msg.data as { text?: string })?.text || '111';
        const result = elementMarker.fillAllTextInputs(text);

        sendResponse({
          success: result.success,
          message: result.message,
          data: {
            filledCount: result.filledCount,
          },
        });
      } catch (error) {
        console.error('填充文本输入框失败:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '填充失败',
        });
      }
    }

    return false;
  },
);

// 导出选择器实例供调试使用
(window as unknown as { lovpenSiderSelector: typeof selector }).lovpenSiderSelector = selector;
