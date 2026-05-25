/**
 * @fileoverview DLO Calculator - Enterprise Grade Application
 * Handles both Forward (Frame -> DLO) and Inverse (DLO -> Frame) calculations.
 * Encapsulated in an IIFE to prevent global namespace pollution.
 */

(function () {
  'use strict';

  // ============================================================
  // SYSTEM CONFIGURATION (SINGLE SOURCE OF TRUTH)
  // ============================================================
  /**
   * Defines all deductions for each system. 
   * Edit these values as required by ESWindows engineering.
   * @constant {Object}
   */
  const SYSTEM_CONFIG = {
    LG225: {
      name: "LG225",
      frames: { single: 3.125, perPiece: 1.5625 },
      lites:  { single: 3.125, perPiece: 1.5625 }
    },
    ES8000: {
      name: "ES-8000/T",
      frames: { single: 5.5, jambEdge: 4.625, center: 3.75 },
      lites:  { single: 5.5,   jambEdge: 4.625,   center: 3.75 }
    },
    CW: {
      name: "CW (1032-7525-7000)",
      frames: { single: 5, jambEdge: 3.75, center: 2.5 },
      lites:  { single: 5, jambEdge: 3.75, center: 2.5 }
    }
  };

  /**
   * Enum for calculation directions to avoid magic strings.
   * @readonly
   * @enum {string}
   */
  const CalcDirection = {
    FORWARD: 'forward', // Frame -> DLO
    INVERSE: 'inverse'  // DLO -> Frame
  };

  // ============================================================
  // DLO CALCULATOR CLASS
  // ============================================================
  class DLOCalculator {
    constructor() {
      // Application State
      this.state = {
        system: null,
        mode: null,
        direction: CalcDirection.FORWARD,
        lastResults: [],
        totalMeasurement: 0,
        qty: 0
      };

      // DOM Elements Cache
      this.dom = {
        inputWidth:    document.getElementById('input-width'),
        inputHeight:   document.getElementById('input-height'),
        inputQuantity: document.getElementById('input-quantity'),
        
        resultsBox:     document.getElementById('results-box'),
        resultsEmpty:   document.getElementById('results-empty'),
        resultsContent: document.getElementById('results-content'),
        summaryDim:     document.getElementById('summary-dim'),
        summaryQty:     document.getElementById('summary-qty'),
        summaryDimLabel:document.getElementById('summary-dim-label'),
        summaryQtyContainer: document.getElementById('summary-qty-container'),
        btnCopy:        document.getElementById('btn-copy'),
        toast:          document.getElementById('toast'),
        
        // Buttons
        btnLG225:  document.getElementById('btn-lg225'),
        btnES8000: document.getElementById('btn-es8000t'),
        btnCW:     document.getElementById('btn-cw'),
        btnFrames: document.getElementById('btn-frames'),
        btnLites:  document.getElementById('btn-lites'),

        // Toggle elements
        toggleInput:   document.getElementById('calc-direction-toggle'),
        labelForward:  document.getElementById('label-forward'),
        labelInverse:  document.getElementById('label-inverse'),
        
        // Dynamic labels
        labelWidth:     document.getElementById('label-width'),
        labelHeight:    document.getElementById('label-height'),
        dimLabel:       document.getElementById('dimensions-label'),
        resultsLabel:   document.getElementById('results-label')
      };

      this.initEvents();
    }

    /**
     * Initializes all event listeners for the application.
     */
    initEvents() {
      const { dom } = this;

      // System Buttons
      const sysBtns = [dom.btnLG225, dom.btnES8000, dom.btnCW];
      dom.btnLG225.onclick  = () => this.setSystem('LG225', dom.btnLG225, sysBtns);
      dom.btnES8000.onclick = () => this.setSystem('ES8000', dom.btnES8000, sysBtns);
      dom.btnCW.onclick     = () => this.setSystem('CW', dom.btnCW, sysBtns);

      // Mode Buttons
      const modeBtns = [dom.btnFrames, dom.btnLites];
      dom.btnFrames.onclick = () => this.setMode('frames', dom.btnFrames, modeBtns);
      dom.btnLites.onclick  = () => this.setMode('lites', dom.btnLites, modeBtns);

      // Inputs
      dom.inputWidth.addEventListener('input', () => this.calculate());
      dom.inputHeight.addEventListener('input', () => this.calculate());
      dom.inputQuantity.addEventListener('input', () => this.calculate());

      // Toggle Direction
      dom.toggleInput.addEventListener('change', (e) => this.toggleDirection(e.target.checked));

      // Copy
      dom.btnCopy.addEventListener('click', () => this.copyToClipboard());
    }

    /**
     * Sets the active system.
     */
    setSystem(systemId, activeBtn, group) {
      group.forEach(b => b.classList.remove('active'));
      activeBtn.classList.add('active');
      this.state.system = systemId;
      this.calculate();
    }

    /**
     * Sets the active mode (frames/lites).
     */
    setMode(modeId, activeBtn, group) {
      group.forEach(b => b.classList.remove('active'));
      activeBtn.classList.add('active');
      this.state.mode = modeId;
      this.calculate();
    }

    /**
     * Toggles between Forward and Inverse calculation modes.
     * @param {boolean} isInverse 
     */
    toggleDirection(isInverse) {
      this.state.direction = isInverse ? CalcDirection.INVERSE : CalcDirection.FORWARD;
      
      const { dom } = this;
      
      // Update UI labels
      if (isInverse) {
        dom.labelForward.classList.remove('active');
        dom.labelInverse.classList.add('active');
        dom.labelWidth.textContent = 'DLO Width';
        dom.labelHeight.textContent = 'DLO Height';
        dom.dimLabel.textContent = '3. DLO Dimensions (Inches)';
        dom.resultsLabel.textContent = 'Results (Total Frame)';
      } else {
        dom.labelInverse.classList.remove('active');
        dom.labelForward.classList.add('active');
        dom.labelWidth.textContent = 'Width';
        dom.labelHeight.textContent = 'Height';
        dom.dimLabel.textContent = '3. Frame Dimensions (Inches)';
        dom.resultsLabel.textContent = 'Results (DLO)';
      }

      this.calculate();
    }

    /**
     * Main Controller: Parses inputs and dispatches to appropriate calculation strategy.
     */
    calculate() {
      const width    = parseFloat(this.dom.inputWidth.value);
      const height   = parseFloat(this.dom.inputHeight.value);
      const quantity = parseInt(this.dom.inputQuantity.value);

      if (!this.state.system || !this.state.mode || isNaN(quantity) || quantity <= 0) {
        this.showEmpty(); 
        return;
      }

      // Determine relevant measurement based on mode
      const measurement = (this.state.mode === 'frames') ? width : height;
      if (isNaN(measurement) || measurement <= 0) { 
        this.showEmpty(); 
        return; 
      }

      const config = SYSTEM_CONFIG[this.state.system];
      const deductions = config[this.state.mode];

      // Strategy execution
      if (this.state.direction === CalcDirection.FORWARD) {
        this.executeForwardMath(measurement, quantity, deductions);
      } else {
        this.executeInverseMath(measurement, quantity, deductions);
      }
    }

    /**
     * Strategy: Calculate DLO from Frame (Forward)
     * @param {number} measurement Total Frame size
     * @param {number} quantity Number of lites/frames
     * @param {Object} deductions Deduction configuration object
     */
    executeForwardMath(measurement, quantity, deductions) {
      let results = [];
      const sys = this.state.system;
      const mode = this.state.mode;

      if (quantity === 1) {
        results.push(measurement - deductions.single);
      } 
      else if (sys === 'LG225') {
        const base = (measurement - deductions.perPiece) / quantity;
        for (let i = 0; i < quantity; i++) {
          results.push(base - deductions.perPiece);
        }
      } 
      else {
        let base = (sys === 'ES8000' && mode === 'frames') 
          ? (measurement / quantity) 
          : ((measurement - deductions.single) / quantity);

        for (let i = 0; i < quantity; i++) {
          const isJambEdge = (i === 0 || i === quantity - 1);
          results.push(isJambEdge ? (base - deductions.jambEdge) : (base - deductions.center));
        }
      }

      // Prevent negatives
      results = results.map(r => Math.max(0, r));
      
      this.state.lastResults = results;
      this.state.totalMeasurement = measurement;
      this.state.qty = quantity;

      this.renderResultsForward();
    }

    /**
     * Strategy: Calculate Total Frame from DLO (Inverse)
     * @param {number} inputDLO Targeted DLO size
     * @param {number} quantity Number of lites
     * @param {Object} deductions Deduction configuration object
     */
    executeInverseMath(inputDLO, quantity, deductions) {
      let totalFrame = 0;
      const sys = this.state.system;
      const mode = this.state.mode;

      if (quantity === 1) {
        totalFrame = inputDLO + deductions.single;
      } 
      else if (sys === 'LG225') {
        totalFrame = (quantity * inputDLO) + ((quantity + 1) * deductions.perPiece);
      } 
      else if (sys === 'ES8000' && mode === 'frames') {
        totalFrame = (quantity * inputDLO) + (2 * deductions.jambEdge) + ((quantity - 2) * deductions.center);
      } 
      else {
        totalFrame = (quantity * inputDLO) + deductions.single + (2 * deductions.jambEdge) + ((quantity - 2) * deductions.center);
      }

      this.state.lastResults = [totalFrame];
      this.state.totalMeasurement = inputDLO; // the DLO requested
      this.state.qty = quantity;

      this.renderResultsInverse(totalFrame);
    }

    /**
     * Hides results and shows awaiting prompt
     */
    showEmpty() {
      this.dom.resultsContent.classList.remove('visible');
      this.dom.resultsEmpty.classList.add('visible');
      this.dom.btnCopy.disabled = true;
      this.state.lastResults = [];
    }

    /**
     * Renders Forward Mode results (list of DLOs)
     */
    renderResultsForward() {
      this.dom.resultsEmpty.classList.remove('visible');
      this.dom.resultsContent.classList.add('visible');
      this.dom.btnCopy.disabled = false;
      this.dom.resultsBox.innerHTML = '';

      this.dom.summaryDimLabel.textContent = 'Total Dim:';
      this.dom.summaryDim.textContent = this.decimalToFraction(this.state.totalMeasurement);
      this.dom.summaryQtyContainer.style.display = 'flex';
      this.dom.summaryQty.textContent = this.state.qty;

      const label = (this.state.mode === 'frames') ? 'Frame' : 'Lite';
      const list = this.state.lastResults;

      list.forEach((value, i) => {
        const isEdge = list.length > 1 && (i === 0 || i === list.length - 1);
        const row = document.createElement('div');
        row.className = 'result-row' + (isEdge ? ' edge' : '');
        row.style.animationDelay = `${i * 0.05}s`;

        row.innerHTML = `
          <span class="row-label">${label} DLO ${i + 1}${isEdge ? ' &middot; Jamb Edge' : ' &middot; Center'}</span>
          <span class="row-value">${this.decimalToFraction(value)}</span>
        `;
        this.dom.resultsBox.appendChild(row);
      });
    }

    /**
     * Renders Inverse Mode results (single Total Frame)
     */
    renderResultsInverse(totalFrame) {
      this.dom.resultsEmpty.classList.remove('visible');
      this.dom.resultsContent.classList.add('visible');
      this.dom.btnCopy.disabled = false;
      this.dom.resultsBox.innerHTML = '';

      this.dom.summaryDimLabel.textContent = 'Target DLO:';
      this.dom.summaryDim.textContent = this.decimalToFraction(this.state.totalMeasurement);
      this.dom.summaryQtyContainer.style.display = 'flex';
      this.dom.summaryQty.textContent = this.state.qty;

      const row = document.createElement('div');
      row.className = 'result-row edge';
      row.innerHTML = `
        <span class="row-label">Required Total Frame Size</span>
        <span class="row-value">${this.decimalToFraction(totalFrame)}</span>
      `;
      this.dom.resultsBox.appendChild(row);
    }

    /**
     * Copies structured results to user's clipboard
     */
    copyToClipboard() {
      if (this.state.lastResults.length === 0) return;
      
      const config = SYSTEM_CONFIG[this.state.system];
      let textToCopy = `${config.name} - ${this.state.mode.toUpperCase()}\n`;
      textToCopy += `Mode: ${this.state.direction === CalcDirection.FORWARD ? 'Frame to DLO' : 'DLO to Frame'}\n`;
      
      if (this.state.direction === CalcDirection.FORWARD) {
        textToCopy += `Total Dim: ${this.decimalToFraction(this.state.totalMeasurement)} | Qty: ${this.state.qty}\n`;
        textToCopy += `--------------------------\n`;
        this.state.lastResults.forEach((val, i) => {
          const isEdge = this.state.qty > 1 && (i === 0 || i === this.state.qty - 1);
          textToCopy += `DLO ${i + 1} ${isEdge ? '(Jamb)' : '(Center)'}: \t${this.decimalToFraction(val)}\n`;
        });
      } else {
        textToCopy += `Target DLO (per lite): ${this.decimalToFraction(this.state.totalMeasurement)} | Qty: ${this.state.qty}\n`;
        textToCopy += `--------------------------\n`;
        textToCopy += `Required Total Frame Size: \t${this.decimalToFraction(this.state.lastResults[0])}\n`;
      }

      navigator.clipboard.writeText(textToCopy).then(() => {
        this.dom.toast.classList.add('show');
        setTimeout(() => { this.dom.toast.classList.remove('show'); }, 2500);
      });
    }

    /**
     * Utility: Converts decimal to closest /16 inch fraction
     * @param {number} n Decimal number
     * @returns {string} Formatted fraction string
     */
    decimalToFraction(n) {
      if (n <= 0) return '0"';
      const whole = Math.trunc(n);
      const frac  = Math.abs(n - whole);
      const denom = 16;
      const numer = Math.round(frac * denom);

      if (numer === 0)     return `${whole}"`;
      if (numer === denom) return `${whole + 1}"`;

      const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
      const d   = gcd(numer, denom);
      const fn  = numer / d;
      const fd  = denom / d;

      return whole === 0 ? `${fn}/${fd}"` : `${whole} ${fn}/${fd}"`;
    }
  }

  // Initialize App on DOM Load
  document.addEventListener('DOMContentLoaded', () => {
    window.dloApp = new DLOCalculator();
  });

})();
