/**
 * SimplifyTracker - Monitors and tracks Simplify extension activity
 * 
 * This utility injects monitoring scripts into pages to detect:
 * - Simplify extension presence
 * - Form autofill events
 * - Field completion status
 * - Manual action requirements
 */

class SimplifyTracker {
  constructor(page, sessionManager, sessionId) {
    this.page = page;
    this.sessionManager = sessionManager;
    this.sessionId = sessionId;
    this.isInitialized = false;
    this.checkInterval = null;
    this.autofillTimeout = null;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // Expose callback functions to the page
      await this.page.exposeFunction('__simplifyDetected', () => this.onSimplifyDetected());
      await this.page.exposeFunction('__fieldFilled', (data) => this.onFieldFilled(data));
      await this.page.exposeFunction('__formSubmitted', (data) => this.onFormSubmitted(data));
      await this.page.exposeFunction('__autofillComplete', () => this.onAutofillComplete());
      await this.page.exposeFunction('__manualActionRequired', (data) => this.onManualActionRequired(data));
    } catch (e) {
      // Functions may already be exposed
    }

    // Inject monitoring script on every navigation
    this.page.on('load', () => this.injectMonitoringScript());
    
    // Start periodic form analysis
    this.startFormAnalysis();
    
    this.isInitialized = true;
  }

  async injectMonitoringScript() {
    try {
      await this.page.evaluate(() => {
        // Check if already injected
        if (window.__simplifyMonitorInjected) return;
        window.__simplifyMonitorInjected = true;

        console.log('[AutoFiller] Simplify monitoring script injected');

        // Track filled fields
        const filledFields = new Set();
        let lastFieldCount = 0;
        let stableCount = 0;

        // Detect Simplify extension
        const detectSimplify = () => {
          // Look for Simplify-specific elements
          const simplifyElements = document.querySelectorAll(
            '[class*="simplify"], [id*="simplify"], [data-simplify]'
          );
          
          // Look for Simplify in the DOM or extension markers
          const hasSimplifyMarker = document.querySelector('script[src*="simplify"]') ||
            document.querySelector('link[href*="simplify"]') ||
            window.__SIMPLIFY__ ||
            simplifyElements.length > 0;

          if (hasSimplifyMarker) {
            window.__simplifyDetected?.();
          }
        };

        // Monitor form field changes
        const monitorFields = () => {
          const inputs = document.querySelectorAll(
            'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), ' +
            'textarea, select'
          );

          let newlyFilled = 0;
          
          inputs.forEach((input) => {
            const fieldId = input.id || input.name || input.placeholder || Math.random().toString();
            const hasValue = input.value && input.value.trim().length > 0;
            
            if (hasValue && !filledFields.has(fieldId)) {
              filledFields.add(fieldId);
              newlyFilled++;
              
              window.__fieldFilled?.({
                fieldId,
                fieldType: input.type || input.tagName.toLowerCase(),
                fieldName: input.name,
                fieldLabel: findLabel(input)
              });
            }
          });

          return {
            total: inputs.length,
            filled: filledFields.size,
            newlyFilled
          };
        };

        // Find label for an input
        const findLabel = (input) => {
          // Try aria-label
          if (input.getAttribute('aria-label')) {
            return input.getAttribute('aria-label');
          }
          
          // Try associated label
          if (input.id) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            if (label) return label.textContent.trim();
          }
          
          // Try parent label
          const parentLabel = input.closest('label');
          if (parentLabel) {
            return parentLabel.textContent.trim();
          }
          
          // Try placeholder
          return input.placeholder || input.name || 'Unknown';
        };

        // Check for autofill completion
        const checkAutofillComplete = () => {
          const status = monitorFields();
          
          if (status.filled === lastFieldCount && status.filled > 0) {
            stableCount++;
            
            // If fields haven't changed for 3 checks (6 seconds), consider autofill complete
            if (stableCount >= 3 && status.filled >= status.total * 0.5) {
              window.__autofillComplete?.();
            }
          } else {
            stableCount = 0;
          }
          
          lastFieldCount = status.filled;
          
          // Check for required empty fields
          const emptyRequired = document.querySelectorAll(
            'input[required]:not([type="hidden"]):not(:valid), ' +
            'select[required]:not(:valid), ' +
            'textarea[required]:not(:valid)'
          );
          
          if (emptyRequired.length > 0 && stableCount >= 3) {
            window.__manualActionRequired?.({
              emptyRequiredCount: emptyRequired.length,
              fields: Array.from(emptyRequired).slice(0, 5).map(f => ({
                name: f.name,
                type: f.type,
                label: findLabel(f)
              }))
            });
          }
        };

        // Monitor for form submissions
        document.addEventListener('submit', (e) => {
          window.__formSubmitted?.({
            action: e.target.action,
            method: e.target.method,
            fields: filledFields.size
          });
        }, true);

        // Also catch click on submit buttons
        document.addEventListener('click', (e) => {
          const target = e.target;
          if (target.type === 'submit' || 
              target.tagName === 'BUTTON' || 
              target.closest('button[type="submit"]')) {
            setTimeout(() => {
              window.__formSubmitted?.({
                triggeredBy: 'click',
                fields: filledFields.size
              });
            }, 500);
          }
        }, true);

        // Use MutationObserver to detect DOM changes (autofill activity)
        const observer = new MutationObserver((mutations) => {
          let hasRelevantChange = false;
          
          for (const mutation of mutations) {
            if (mutation.type === 'childList' || 
                (mutation.type === 'attributes' && 
                 ['value', 'class', 'style'].includes(mutation.attributeName))) {
              hasRelevantChange = true;
              break;
            }
          }
          
          if (hasRelevantChange) {
            detectSimplify();
            monitorFields();
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['value', 'class', 'style', 'data-simplify']
        });

        // Initial checks
        setTimeout(() => {
          detectSimplify();
          monitorFields();
        }, 1000);

        // Periodic check for autofill completion
        setInterval(checkAutofillComplete, 2000);
      });
    } catch (error) {
      console.error('Error injecting Simplify monitoring script:', error);
    }
  }

  startFormAnalysis() {
    // Analyze form state every 5 seconds
    this.checkInterval = setInterval(async () => {
      try {
        const formStatus = await this.analyzeFormState();
        
        if (formStatus) {
          this.sessionManager.addEvent(this.sessionId, {
            type: 'form_analysis',
            message: `Form analysis: ${formStatus.filledFields}/${formStatus.totalFields} fields filled`,
            data: formStatus
          });

          // Update session form data
          const session = this.sessionManager.getRawSession(this.sessionId);
          if (session) {
            session.formData = {
              ...session.formData,
              filledFields: formStatus.filledFields,
              pendingFields: formStatus.emptyFields,
              totalFields: formStatus.totalFields,
              completionPercentage: formStatus.completionPercentage
            };
          }
        }
      } catch (error) {
        // Page might have navigated, ignore
      }
    }, 5000);
  }

  async analyzeFormState() {
    try {
      return await this.page.evaluate(() => {
        const inputs = document.querySelectorAll(
          'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), ' +
          'textarea, select'
        );

        let filled = 0;
        let empty = 0;
        const emptyFieldNames = [];

        inputs.forEach(input => {
          if (input.disabled || input.readOnly) return;
          
          if (input.value && input.value.trim()) {
            filled++;
          } else {
            empty++;
            const name = input.name || input.placeholder || input.id || 'unknown';
            if (emptyFieldNames.length < 10) {
              emptyFieldNames.push(name);
            }
          }
        });

        const total = filled + empty;
        
        return {
          totalFields: total,
          filledFields: filled,
          emptyFields: empty,
          completionPercentage: total > 0 ? Math.round((filled / total) * 100) : 0,
          emptyFieldNames,
          url: window.location.href,
          pageTitle: document.title
        };
      });
    } catch (error) {
      return null;
    }
  }

  onSimplifyDetected() {
    console.log(`[Session ${this.sessionId}] Simplify extension detected`);
    this.sessionManager.updateSimplifyStatus(this.sessionId, { detected: true });
    this.sessionManager.addEvent(this.sessionId, {
      type: 'simplify_detected',
      message: 'Simplify extension detected on page'
    });
  }

  onFieldFilled(data) {
    const session = this.sessionManager.getRawSession(this.sessionId);
    if (session) {
      session.simplifyStatus.fieldsFilledCount++;
      session.simplifyStatus.autofillStarted = true;
      
      // Don't spam events for every field
      if (session.simplifyStatus.fieldsFilledCount % 5 === 1) {
        this.sessionManager.addEvent(this.sessionId, {
          type: 'fields_autofilled',
          message: `${session.simplifyStatus.fieldsFilledCount} fields auto-filled`,
          data
        });
      }
    }
  }

  onFormSubmitted(data) {
    console.log(`[Session ${this.sessionId}] Form submitted`, data);
    this.sessionManager.addEvent(this.sessionId, {
      type: 'form_submitted',
      message: 'Application form submitted',
      data
    });
    
    // Wait a moment then check for confirmation page
    setTimeout(() => this.checkForConfirmation(), 2000);
  }

  onAutofillComplete() {
    console.log(`[Session ${this.sessionId}] Autofill complete`);
    
    // Clear any pending timeout
    if (this.autofillTimeout) {
      clearTimeout(this.autofillTimeout);
    }
    
    this.sessionManager.markAutofillComplete(this.sessionId);
  }

  onManualActionRequired(data) {
    const session = this.sessionManager.getRawSession(this.sessionId);
    if (session) {
      session.simplifyStatus.manualFieldsRequired = data.emptyRequiredCount;
    }
    
    this.sessionManager.addNotification(this.sessionId, {
      type: 'warning',
      message: `${data.emptyRequiredCount} required fields need manual input`
    });
    
    this.sessionManager.addEvent(this.sessionId, {
      type: 'manual_action_required',
      message: `Manual action required for ${data.emptyRequiredCount} fields`,
      data
    });
  }

  async checkForConfirmation() {
    try {
      const url = this.page.url();
      const title = await this.page.title();
      
      const confirmationPatterns = [
        /thank\s*you/i,
        /confirmation/i,
        /submitted/i,
        /success/i,
        /received/i,
        /complete/i
      ];

      const isConfirmation = confirmationPatterns.some(pattern => 
        pattern.test(url) || pattern.test(title)
      );

      if (isConfirmation) {
        this.sessionManager.markSessionComplete(this.sessionId);
      }
    } catch (error) {
      // Page might have closed
    }
  }

  cleanup() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.autofillTimeout) {
      clearTimeout(this.autofillTimeout);
      this.autofillTimeout = null;
    }
  }
}

module.exports = SimplifyTracker;
